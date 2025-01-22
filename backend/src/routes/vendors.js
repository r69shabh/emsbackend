import express from 'express';
import { z } from 'zod';
import db from '../db/index.js';
import { authenticateToken, authorize } from '../middleware/auth.js';
import { randomUUID } from 'crypto';
import { redis } from '../index.js';
import pkg from 'sanitize-html';
const { sanitizeHtml } = pkg;

const router = express.Router();

const CACHE_TTL = 300; // 5 minutes

// Validation schemas
const boothSchema = z.object({
    eventId: z.string().uuid(),
    boothNumber: z.string(),
    location: z.string().min(3),
    description: z.string().transform(val => sanitizeHtml(val)),
    setupTime: z.string().datetime(),
    teardownTime: z.string().datetime()
});

const productSchema = z.object({
    name: z.string().min(3).transform(val => sanitizeHtml(val)),
    description: z.string().transform(val => sanitizeHtml(val)),
    price: z.number().positive(),
    stockQuantity: z.number().int().min(0),
    category: z.string(),
    imageUrl: z.string().url().optional()
});

// Get vendor's booths
router.get('/booths', authenticateToken, authorize(['vendor']), async (req, res) => {
    try {
        const cacheKey = `vendor:${req.user.id}:booths`;
        const cachedBooths = await redis.get(cacheKey);
        
        if (cachedBooths) {
            return res.json(JSON.parse(cachedBooths));
        }

        const booths = await db.query(
            `SELECT vb.*, e.title as event_title, e.date as event_date,
                    (SELECT COUNT(*) FROM sales_transactions st 
                     WHERE st.booth_id = vb.id AND st.status = 'completed') as total_sales
             FROM vendor_booths vb
             JOIN events e ON vb.event_id = e.id
             WHERE vb.vendor_id = ?
             ORDER BY e.date DESC`,
            [req.user.id]
        );

        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(booths));
        res.json(booths);
    } catch (error) {
        console.error('Error fetching vendor booths:', error);
        res.status(500).json({ error: 'Failed to fetch vendor booths' });
    }
});

// Apply for a booth
router.post('/booths', authenticateToken, authorize(['vendor']), async (req, res) => {
    try {
        const validatedData = boothSchema.parse(req.body);
        const boothId = randomUUID();

        await db.exec('BEGIN');

        // Check if event exists and is accepting vendors
        const [event] = await db.query(
            'SELECT * FROM events WHERE id = ? AND status = "published"',
            [validatedData.eventId]
        );

        if (!event) {
            await db.exec('ROLLBACK');
            return res.status(404).json({ error: 'Event not found or not accepting vendors' });
        }

        // Check if booth number is available
        const [existingBooth] = await db.query(
            'SELECT * FROM vendor_booths WHERE event_id = ? AND booth_number = ?',
            [validatedData.eventId, validatedData.boothNumber]
        );

        if (existingBooth) {
            await db.exec('ROLLBACK');
            return res.status(400).json({ error: 'Booth number already taken' });
        }

        await db.exec(
            `INSERT INTO vendor_booths (id, event_id, vendor_id, booth_number, location, description, status, setup_time, teardown_time)
             VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
            [
                boothId,
                validatedData.eventId,
                req.user.id,
                validatedData.boothNumber,
                validatedData.location,
                validatedData.description,
                validatedData.setupTime,
                validatedData.teardownTime
            ]
        );

        await db.exec('COMMIT');
        await redis.del(`vendor:${req.user.id}:booths`);

        res.status(201).json({ id: boothId, status: 'pending' });
    } catch (error) {
        await db.exec('ROLLBACK');
        console.error('Error creating vendor booth:', error);
        res.status(500).json({ error: 'Failed to create vendor booth' });
    }
});

// Get booth products
router.get('/booths/:boothId/products', authenticateToken, async (req, res) => {
    try {
        const { boothId } = req.params;
        const cacheKey = `booth:${boothId}:products`;
        
        const cachedProducts = await redis.get(cacheKey);
        if (cachedProducts) {
            return res.json(JSON.parse(cachedProducts));
        }

        // Verify booth ownership if vendor
        if (req.user.role === 'vendor') {
            const [booth] = await db.query(
                'SELECT * FROM vendor_booths WHERE id = ? AND vendor_id = ?',
                [boothId, req.user.id]
            );

            if (!booth) {
                return res.status(403).json({ error: 'Not authorized to view this booth' });
            }
        }

        const products = await db.query(
            'SELECT * FROM vendor_products WHERE booth_id = ?',
            [boothId]
        );

        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(products));
        res.json(products);
    } catch (error) {
        console.error('Error fetching booth products:', error);
        res.status(500).json({ error: 'Failed to fetch booth products' });
    }
});

// Add product to booth
router.post('/booths/:boothId/products', authenticateToken, authorize(['vendor']), async (req, res) => {
    try {
        const { boothId } = req.params;
        const validatedData = productSchema.parse(req.body);

        await db.exec('BEGIN');

        // Verify booth ownership
        const [booth] = await db.query(
            'SELECT * FROM vendor_booths WHERE id = ? AND vendor_id = ?',
            [boothId, req.user.id]
        );

        if (!booth) {
            await db.exec('ROLLBACK');
            return res.status(403).json({ error: 'Not authorized to add products to this booth' });
        }

        const productId = randomUUID();

        await db.exec(
            `INSERT INTO vendor_products (id, booth_id, name, description, price, stock_quantity, category, image_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                productId,
                boothId,
                validatedData.name,
                validatedData.description,
                validatedData.price,
                validatedData.stockQuantity,
                validatedData.category,
                validatedData.imageUrl
            ]
        );

        await db.exec('COMMIT');
        await redis.del(`booth:${boothId}:products`);

        res.status(201).json({ id: productId });
    } catch (error) {
        await db.exec('ROLLBACK');
        console.error('Error adding product:', error);
        res.status(500).json({ error: 'Failed to add product' });
    }
});

// Get sales analytics
router.get('/booths/:boothId/analytics', authenticateToken, authorize(['vendor', 'admin']), async (req, res) => {
    try {
        const { boothId } = req.params;
        const { startDate, endDate } = req.query;

        // Verify booth ownership if vendor
        if (req.user.role === 'vendor') {
            const [booth] = await db.query(
                'SELECT * FROM vendor_booths WHERE id = ? AND vendor_id = ?',
                [boothId, req.user.id]
            );

            if (!booth) {
                return res.status(403).json({ error: 'Not authorized to view these analytics' });
            }
        }

        // Get sales summary
        const salesSummary = await db.query(
            `SELECT 
                COUNT(*) as total_transactions,
                SUM(total_amount) as total_revenue,
                AVG(total_amount) as average_transaction_value,
                payment_method,
                DATE(transaction_time) as date
             FROM sales_transactions
             WHERE booth_id = ? 
                AND status = 'completed'
                AND transaction_time BETWEEN ? AND ?
             GROUP BY DATE(transaction_time), payment_method
             ORDER BY date DESC`,
            [boothId, startDate || '1970-01-01', endDate || '9999-12-31']
        );

        // Get top selling products
        const topProducts = await db.query(
            `SELECT 
                p.name,
                SUM(s.quantity) as total_quantity,
                SUM(s.total_amount) as total_revenue
             FROM sales_transactions s
             JOIN vendor_products p ON s.product_id = p.id
             WHERE s.booth_id = ? 
                AND s.status = 'completed'
                AND s.transaction_time BETWEEN ? AND ?
             GROUP BY p.id
             ORDER BY total_revenue DESC
             LIMIT 5`,
            [boothId, startDate || '1970-01-01', endDate || '9999-12-31']
        );

        res.json({
            salesSummary,
            topProducts,
            periodStart: startDate || 'all time',
            periodEnd: endDate || 'present'
        });
    } catch (error) {
        console.error('Error fetching sales analytics:', error);
        res.status(500).json({ error: 'Failed to fetch sales analytics' });
    }
});

// Record a sale
router.post('/booths/:boothId/sales', authenticateToken, authorize(['vendor']), async (req, res) => {
    try {
        const { boothId } = req.params;
        const { productId, quantity, paymentMethod, buyerId } = req.body;

        await db.exec('BEGIN');

        // Verify booth ownership
        const [booth] = await db.query(
            'SELECT * FROM vendor_booths WHERE id = ? AND vendor_id = ? AND status = "active"',
            [boothId, req.user.id]
        );

        if (!booth) {
            await db.exec('ROLLBACK');
            return res.status(403).json({ error: 'Not authorized or booth not active' });
        }

        // Get product details and check stock
        const [product] = await db.query(
            'SELECT * FROM vendor_products WHERE id = ? AND booth_id = ?',
            [productId, boothId]
        );

        if (!product || product.stock_quantity < quantity) {
            await db.exec('ROLLBACK');
            return res.status(400).json({ error: 'Product not available or insufficient stock' });
        }

        const totalAmount = product.price * quantity;
        const transactionId = randomUUID();

        // Record the sale
        await db.exec(
            `INSERT INTO sales_transactions 
             (id, booth_id, product_id, buyer_id, quantity, unit_price, total_amount, payment_method, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
            [transactionId, boothId, productId, buyerId, quantity, product.price, totalAmount, paymentMethod]
        );

        // Update stock
        await db.exec(
            'UPDATE vendor_products SET stock_quantity = stock_quantity - ? WHERE id = ?',
            [quantity, productId]
        );

        await db.exec('COMMIT');
        
        // Invalidate relevant caches
        await redis.del(`booth:${boothId}:products`);
        await redis.del(`vendor:${req.user.id}:booths`);

        res.status(201).json({
            transactionId,
            totalAmount,
            remainingStock: product.stock_quantity - quantity
        });
    } catch (error) {
        await db.exec('ROLLBACK');
        console.error('Error recording sale:', error);
        res.status(500).json({ error: 'Failed to record sale' });
    }
});

export default router;
