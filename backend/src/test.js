import fetch from 'node-fetch';
import assert from 'assert';

const BASE_URL = 'http://localhost:3000/api';
let authToken = '';
let eventId = '';

const test = async () => {
  try {
    // Test health check
    console.log('\n🔹 Testing Health Check...');
    const healthRes = await fetch('http://localhost:3000/health');
    assert.strictEqual(healthRes.status, 200);
    console.log('✅ Health check successful');

    // Test Registration
    console.log('\n🔹 Testing User Registration...');
    const registerRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        role: 'organizer'
      })
    });
    const registerData = await registerRes.json();
    assert.ok(registerData.token);
    authToken = registerData.token;
    console.log('✅ Registration successful');

    // Test Login
    console.log('\n🔹 Testing Login...');
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123'
      })
    });
    const loginData = await loginRes.json();
    assert.ok(loginData.token);
    console.log('✅ Login successful');

    // Test Create Event
    console.log('\n🔹 Testing Event Creation...');
    const eventRes = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        title: 'Test Event',
        description: 'This is a test event',
        date: '2024-12-25',
        location: 'Test Location',
        category: 'academic',
        capacity: 100
      })
    });
    const eventData = await eventRes.json();
    assert.ok(eventData.id);
    eventId = eventData.id;
    console.log('✅ Event created successfully');

    // Test Get Events
    console.log('\n🔹 Testing Get Events...');
    const getEventsRes = await fetch(`${BASE_URL}/events`, {
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
    const getEventRes = await fetch(`${BASE_URL}/events/${eventId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    const event = await getEventRes.json();
    assert.strictEqual(event.title, 'Test Event');
    console.log('✅ Retrieved single event successfully');

    // Test Event Registration
    console.log('\n🔹 Testing Event Registration...');
    const registerEventRes = await fetch(`${BASE_URL}/events/${eventId}/register`, {
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
    const profileRes = await fetch(`${BASE_URL}/users/profile`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    const profile = await profileRes.json();
    assert.strictEqual(profile.name, 'Test User');
    console.log('✅ Retrieved user profile successfully');

    // Test Get User's Registered Events
    console.log('\n🔹 Testing Get User\'s Registered Events...');
    const registeredEventsRes = await fetch(`${BASE_URL}/users/registered-events`, {
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
    process.exit(1);
  }
};

test();