import express from 'express';
import { z } from 'zod';
import db from '../db/index.js';
import { authenticateToken, authorize } from '../middleware/auth.js';
import { redis } from '../index.js';
import { sanitizeHtml } from 'sanitize-html';

const router = express.Router();

const CACHE_TTL = 300; // 5 minutes

// Validation schemas
const announcementSchema = z.object({
    title: z.string().min(3).transform(val => sanitizeHtml(val)),
    content: z.string().transform(val => sanitizeHtml(val)),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    eventId: z.string().uuid()
});

// Get system-wide analytics
router.get('/analytics', authenticateToken, authorize(['admin']), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const period = `AND created_at BETWEEN ? AND ?`;
        const dateParams = [startDate || '1970-01-01', endDate || '9999-12-31'];

        // Event statistics
        const eventStats = await db.query(
            `SELECT 
                COUNT(*) as total_events,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_events,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_events,
                SUM(capacity) as total_capacity,
                AVG(
                    (SELECT COUNT(*) FROM registrations r 
                     WHERE r.event_id = e.id AND r.status = 'confirmed')
                ) as avg_registrations
             FROM events e
             WHERE created_at BETWEEN ? AND ?`,
            dateParams
        );

        // Registration statistics
        const registrationStats = await db.query(
            `SELECT 
                COUNT(*) as total_registrations,
                COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_registrations,
                COUNT(CASE WHEN status = 'waitlist' THEN 1 END) as waitlisted_registrations,
                COUNT(CASE WHEN status = 'attended' THEN 1 END) as actual_attendees,
                AVG(CASE WHEN payment_status = 'completed' THEN amount_paid END) as avg_ticket_price
             FROM registrations
             WHERE created_at BETWEEN ? AND ?`,
            dateParams
        );

        // Vendor statistics
        const vendorStats = await db.query(
            `SELECT 
                COUNT(DISTINCT vb.vendor_id) as total_vendors,
                COUNT(DISTINCT vb.id) as total_booths,
                SUM(st.total_amount) as total_sales_revenue,
                AVG(st.total_amount) as avg_transaction_value
             FROM vendor_booths vb
             LEFT JOIN sales_transactions st ON vb.id = st.booth_id
             WHERE vb.created_at BETWEEN ? AND ?`,
            dateParams
        );

        // User growth
        const userGrowth = await db.query(
            `SELECT 
                DATE(created_at) as date,
                COUNT(*) as new_users,
                role
             FROM users
             WHERE created_at BETWEEN ? AND ?
             GROUP BY DATE(created_at), role
             ORDER BY date`,
            dateParams
        );

        res.json({
            eventStats: eventStats[0],
            registrationStats: registrationStats[0],
            vendorStats: vendorStats[0],
            userGrowth
        });
    } catch (error) {
        console.error('Error fetching admin analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// Manage vendor applications
router.get('/vendor-applications', authenticateToken, authorize(['admin']), async (req, res) => {
    try {
        const applications = await db.query(
            `SELECT vb.*, u.name as vendor_name, u.email as vendor_email,
                    e.title as event_title, e.date as event_date
             FROM vendor_booths vb
             JOIN users u ON vb.vendor_id = u.id
             JOIN events e ON vb.event_id = e.id
             WHERE vb.status = 'pending'
             ORDER BY e.date ASC`
        );

        res.json(applications);
    } catch (error) {
        console.error('Error fetching vendor applications:', error);
        res.status(500).json({ error: 'Failed to fetch vendor applications' });
    }
});

// Approve/reject vendor application
router.put('/vendor-applications/:id', authenticateToken, authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reason } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        await db.exec('BEGIN');

        const [booth] = await db.query(
            'SELECT vendor_id, event_id FROM vendor_booths WHERE id = ?',
            [id]
        );

        if (!booth) {
            await db.exec('ROLLBACK');
            return res.status(404).json({ error: 'Application not found' });
        }

        await db.exec(
            'UPDATE vendor_booths SET status = ? WHERE id = ?',
            [status, id]
        );

        // TODO: Send notification to vendor

        await db.exec('COMMIT');
        await redis.del(`vendor:${booth.vendor_id}:booths`);

        res.json({ message: `Vendor application ${status}` });
    } catch (error) {
        await db.exec('ROLLBACK');
        console.error('Error updating vendor application:', error);
        res.status(500).json({ error: 'Failed to update vendor application' });
    }
});

// Create event announcement
router.post('/announcements', authenticateToken, authorize(['admin']), async (req, res) => {
    try {
        const validatedData = announcementSchema.parse(req.body);

        await db.exec('BEGIN');

        // Verify event exists
        const [event] = await db.query(
            'SELECT * FROM events WHERE id = ?',
            [validatedData.eventId]
        );

        if (!event) {
            await db.exec('ROLLBACK');
            return res.status(404).json({ error: 'Event not found' });
        }

        const announcementId = randomUUID();

        await db.exec(
            `INSERT INTO announcements (id, event_id, title, content, priority, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                announcementId,
                validatedData.eventId,
                validatedData.title,
                validatedData.content,
                validatedData.priority,
                req.user.id
            ]
        );

        // TODO: Send notifications to event attendees

        await db.exec('COMMIT');
        await redis.del(`event:${validatedData.eventId}:announcements`);

        res.status(201).json({ id: announcementId });
    } catch (error) {
        await db.exec('ROLLBACK');
        console.error('Error creating announcement:', error);
        res.status(500).json({ error: 'Failed to create announcement' });
    }
});

// Get event feedback summary
router.get('/events/:eventId/feedback', authenticateToken, authorize(['admin']), async (req, res) => {
    try {
        const { eventId } = req.params;
        
        const feedbackSummary = await db.query(
            `SELECT 
                COUNT(*) as total_responses,
                AVG(rating) as average_rating,
                COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
                COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
                COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
                COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
                COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
             FROM event_feedback
             WHERE event_id = ?`,
            [eventId]
        );

        const recentFeedback = await db.query(
            `SELECT f.*, u.name as user_name
             FROM event_feedback f
             LEFT JOIN users u ON f.user_id = u.id
             WHERE f.event_id = ? AND f.anonymous = FALSE
             ORDER BY f.created_at DESC
             LIMIT 10`,
            [eventId]
        );

        res.json({
            summary: feedbackSummary[0],
            recentFeedback
        });
    } catch (error) {
        console.error('Error fetching event feedback:', error);
        res.status(500).json({ error: 'Failed to fetch event feedback' });
    }
});

// Get system health status
router.get('/system-health', authenticateToken, authorize(['admin']), async (req, res) => {
    try {
        const dbStatus = await db.query('SELECT 1');
        const redisStatus = await redis.ping();
        
        const activeConnections = await db.query(
            'SELECT COUNT(*) as count FROM users WHERE last_active > datetime("now", "-5 minutes")'
        );

        const systemStatus = {
            database: dbStatus ? 'healthy' : 'error',
            cache: redisStatus === 'PONG' ? 'healthy' : 'error',
            activeUsers: activeConnections[0].count,
            timestamp: new Date(),
            version: process.env.APP_VERSION || '1.0.0'
        };

        res.json(systemStatus);
    } catch (error) {
        console.error('Error checking system health:', error);
        res.status(500).json({ error: 'Failed to check system health' });
    }
});

export default router;
