// @ts-nocheck
import fetch from 'node-fetch';
import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';
import db from './db/index.js';
import { app } from './index.js';

// Enhanced fetch with better error handling
const fetchWithRetry = async (url, options = {}, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`);
        error.response = response;
        throw error;
      }
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};

// Start server before tests
let server;
const startServer = async () => {
  return new Promise((resolve, reject) => {
    const port = 3000;
    const maxAttempts = 5;
    
    const tryStart = (attempt = 0) => {
      const currentPort = port + attempt;
      
      server = app.listen(currentPort, () => {
        console.log(`Test server started on port ${currentPort}`);
        process.env.TEST_PORT = currentPort.toString();
        
        // Verify server is actually running
        const checkServer = async () => {
          try {
            const healthRes = await fetchWithRetry(`http://localhost:${currentPort}/health`);
            if (healthRes.status === 200) {
              console.log('✅ Server health check passed');
              resolve();
            } else {
              reject(new Error(`Server health check failed with status ${healthRes.status}`));
            }
          } catch (error) {
            reject(new Error(`Server health check failed: ${error.message}`));
          }
        };
        
        // Give server a moment to initialize
        setTimeout(checkServer, 500);
      }).on('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
          console.log(`Port ${currentPort} in use, trying ${currentPort + 1}...`);
          tryStart(attempt + 1);
        } else {
          reject(new Error(`Failed to start server: ${err.message}`));
        }
      });
    };
    
    tryStart();
  });
};

// Stop server after tests
const stopServer = async () => {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        console.log('Test server stopped');
        resolve();
      });
    } else {
      resolve();
    }
  });
};

// Test configuration
const TEST_ATTENDEE = {
  name: `Test Attendee ${uuidv4()}`,
  email: `attendee-${uuidv4()}@example.com`,
  password: 'password123',
  role: 'attendee'
};

const TEST_ORGANIZER = {
  name: `Test Organizer ${uuidv4()}`,
  email: `organizer-${uuidv4()}@example.com`,
  password: 'password123',
  role: 'organizer'
};

const getFutureDate = (daysFromNow = 1) => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
};

const TEST_EVENT = {
  title: `Test Event ${uuidv4()}`,
  description: 'This is a test event',
  date: getFutureDate(30), // Set date 30 days in the future
  location: 'Test Location',
  category: 'academic',
  capacity: 100,
  ticket_price: 0, // Changed from ticketPrice
  is_virtual: false, // Changed from isVirtual
  registration_deadline: getFutureDate(29) // Add registration deadline one day before event
};

// Verify database schema
const verifySchema = async () => {
  try {
    console.log('Verifying database schema...');
    
    // Check required tables exist
    const requiredTables = ['users', 'events', 'registrations'];
    const tables = await db.query(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    
    const existingTables = tables.map(row => row.name);
    const missingTables = requiredTables.filter(
      table => !existingTables.includes(table)
    );
    
    if (missingTables.length > 0) {
      throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
    }
    
    // Enable foreign key constraints
    await db.query('PRAGMA foreign_keys = ON');
    console.log('✅ Database schema verified successfully');
  } catch (error) {
    console.error('❌ Database schema verification failed:', error.message);
    throw error;
  }
};

// Clean test data before running tests
const cleanTestData = async () => {
  try {
    console.log('Cleaning test data...');
    await db.query('DELETE FROM registrations');
    await db.query('DELETE FROM events');
    await db.query('DELETE FROM users');
    console.log('✅ Test data cleaned successfully');
  } catch (error) {
    console.error('❌ Test data cleanup failed:', error.message);
    throw error;
  }
};

// Initialize database before tests
const initializeDatabase = async () => {
  try {
    console.log('Initializing database...');
    await verifySchema();
    await cleanTestData();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
};

// Cleanup function
const cleanup = async () => {
  try {
    // Delete all test data from database directly
    await db.query('DELETE FROM registrations');
    await db.query('DELETE FROM events');
    await db.query('DELETE FROM users');
    console.log('✅ Test data cleaned successfully');
  } catch (error) {
    console.error('❌ Test data cleanup failed:', error.message);
  } finally {
    // Close database connection
    await db.close();
  }
};

const BASE_URL = `http://localhost:${process.env.TEST_PORT || 3000}/api`;
let authToken = '';
let eventId = '';

const test = async () => {
  try {
    // Start server and initialize database
    await startServer();
    await initializeDatabase();

    // Test health check
    console.log('\n🔹 Testing Health Check...');
    const healthRes = await fetchWithRetry(`http://localhost:${process.env.TEST_PORT || 3000}/health`);
    assert.strictEqual(healthRes.status, 200);
    console.log('✅ Health check successful');

    // Register and login as organizer
    console.log('\n🔹 Registering Organizer...');
    const organizerRegisterRes = await fetchWithRetry(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_ORGANIZER)
    });
    const organizerRegisterData = await organizerRegisterRes.json();
    assert.ok(organizerRegisterData.token);
    const organizerToken = organizerRegisterData.token;
    console.log('✅ Organizer registration successful');

    // Login as organizer to verify token
    console.log('\n🔹 Verifying Organizer Login...');
    const organizerLoginRes = await fetchWithRetry(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_ORGANIZER.email,
        password: TEST_ORGANIZER.password,
        portal: 'organizer'
      })
    });
    assert.strictEqual(organizerLoginRes.status, 200);
    const organizerLoginData = await organizerLoginRes.json();
    assert.ok(organizerLoginData.token);
    console.log('✅ Organizer login successful');

    // Register and login as attendee
    console.log('\n🔹 Registering Attendee...');
    const attendeeRegisterRes = await fetchWithRetry(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_ATTENDEE)
    });
    const attendeeRegisterData = await attendeeRegisterRes.json();
    assert.ok(attendeeRegisterData.token);
    authToken = attendeeRegisterData.token;
    console.log('✅ Attendee registration successful');

    // Test Login and Profile in single request
    console.log('\n🔹 Testing Login and Profile...');
    const loginRes = await fetchWithRetry(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_ATTENDEE.email,
        password: TEST_ATTENDEE.password,
        portal: 'attendee'
      })
    });
    
    // Validate login response
    assert.strictEqual(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert.ok(loginData.token, 'Login token missing');
    assert.ok(loginData.user, 'User data missing');
    assert.strictEqual(loginData.user.email, TEST_ATTENDEE.email);
    assert.strictEqual(loginData.user.role, TEST_ATTENDEE.role);
    authToken = loginData.token;
    console.log('✅ Login and profile verification successful');

    // Test Create Event
    console.log('\n🔹 Testing Event Creation...');
    try {
      const eventRes = await fetchWithRetry(`${BASE_URL}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${organizerToken}`
        },
        body: JSON.stringify({
          ...TEST_EVENT,
          date: getFutureDate(30) // Ensure using a future date
        })
      });
      
      if (!eventRes.ok) {
        const errorData = await eventRes.json();
        console.error('Event creation failed:', errorData);
        throw new Error(`HTTP error! status: ${eventRes.status}`);
      }
      
      const eventData = await eventRes.json();
      assert.ok(eventData.id);
      eventId = eventData.id;
      console.log('✅ Event created successfully');
    } catch (error) {
      console.error('Event creation error details:', error);
      throw error;
    }

    // Test Get Events
    console.log('\n🔹 Testing Get Events...');
    const getEventsRes = await fetchWithRetry(`${BASE_URL}/events`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    const events = await getEventsRes.json();
    assert.ok(Array.isArray(events));
    assert.ok(events.length > 0);
    console.log(`✅ Retrieved ${events.length} events`);

    // Test Get Single Event
    console.log('\n🔹 Testing Get Single Event...');
    const getEventRes = await fetchWithRetry(`${BASE_URL}/events/${eventId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    const event = await getEventRes.json();
    assert.strictEqual(event.title, TEST_EVENT.title);
    console.log('✅ Retrieved single event successfully');

    // Test Event Registration
    console.log('\n🔹 Testing Event Registration...');
    const registerEventRes = await fetchWithRetry(`${BASE_URL}/events/${eventId}/register`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    const registerEventData = await registerEventRes.json();
    assert.ok(registerEventData.qrCode);
    console.log('✅ Event registration successful');

    // Test Get User's Registered Events
    console.log('\n🔹 Testing Get User\'s Registered Events...');
    const registeredEventsRes = await fetchWithRetry(`${BASE_URL}/users/registered-events`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    const registeredEvents = await registeredEventsRes.json();
    assert.ok(Array.isArray(registeredEvents));
    assert.ok(registeredEvents.length > 0);
    console.log('✅ Retrieved user\'s registered events successfully');

    console.log('\n✨ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exitCode = 1;
  } finally {
    console.log('\n🧹 Cleaning up test data...');
    await cleanup();
    await stopServer();
    process.exit();
  }
};

// Run tests with retries
const runTestsWithRetries = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      await test();
      break;
    } catch (error) {
      if (i === retries - 1) {
        throw error;
      }
      console.log(`\n🔄 Retrying tests... (${i + 1}/${retries})`);
    }
  }
};

// Start tests
runTestsWithRetries().catch(error => {
  console.error('❌ All test attempts failed:', error);
  process.exit(1);
});
