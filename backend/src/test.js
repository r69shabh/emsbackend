import fetch from 'node-fetch';
import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';
import db from './db/index.js';

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

// Verify server is running before tests
const verifyServer = async () => {
  try {
    const healthRes = await fetchWithRetry('http://localhost:3000/health');
    if (healthRes.status !== 200) {
      throw new Error('Server not running or unhealthy');
    }
  } catch (error) {
    console.error('❌ Server verification failed:', error.message);
    process.exit(1);
  }
};

// Test configuration
const TEST_USER = {
  name: `Test User ${uuidv4()}`,
  email: `test-${uuidv4()}@example.com`,
  password: 'password123',
  role: 'organizer'
};

const TEST_EVENT = {
  title: `Test Event ${uuidv4()}`,
  description: 'This is a test event',
  date: '2024-12-25',
  location: 'Test Location',
  category: 'academic',
  capacity: 100
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
const cleanup = async (authToken, eventId) => {
  try {
    // Delete test event
    if (eventId) {
      await fetchWithRetry(`${BASE_URL}/events/${eventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
    }

    // Delete test user
    if (authToken) {
      await fetchWithRetry(`${BASE_URL}/users/me`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
    }

    // Close database connection
    await db.close();
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
};

const BASE_URL = 'http://localhost:3000/api';
let authToken = '';
let eventId = '';

const test = async () => {
  try {
    // Initialize database
    await initializeDatabase();

    // Test health check
    console.log('\n🔹 Testing Health Check...');
    const healthRes = await fetchWithRetry('http://localhost:3000/health');
    assert.strictEqual(healthRes.status, 200);
    console.log('✅ Health check successful');

    // Test Registration
    console.log('\n🔹 Testing User Registration...');
    const registerRes = await fetchWithRetry(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_USER)
    });
    const registerData = await registerRes.json();
    assert.ok(registerData.token);
    authToken = registerData.token;
    console.log('✅ Registration successful');

    // Test Login
    console.log('\n🔹 Testing Login...');
    const loginRes = await fetchWithRetry(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USER.email,
        password: TEST_USER.password
      })
    });
    const loginData = await loginRes.json();
    assert.ok(loginData.token);
    console.log('✅ Login successful');

    // Test Create Event
    console.log('\n🔹 Testing Event Creation...');
    const eventRes = await fetchWithRetry(`${BASE_URL}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(TEST_EVENT)
    });
    const eventData = await eventRes.json();
    assert.ok(eventData.id);
    eventId = eventData.id;
    console.log('✅ Event created successfully');

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

    // Test Get User Profile
    console.log('\n🔹 Testing Get User Profile...');
    const profileRes = await fetchWithRetry(`${BASE_URL}/users/profile`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    const profile = await profileRes.json();
    assert.strictEqual(profile.name, TEST_USER.name);
    console.log('✅ Retrieved user profile successfully');

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
    // Cleanup test data
    console.log('\n🧹 Cleaning up test data...');
    await cleanup(authToken, eventId);
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
