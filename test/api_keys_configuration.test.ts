import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getGoogleCalendarApiKey,
  getFirebaseMessagingApiKey,
} from '../src/lib/googleAuthGis.ts';

describe('Calendar and Firebase Cloud Messaging API Key Configuration', () => {
  it('1. verifies googleCalendarApiKey is recorded in firebase-applet-config.json', () => {
    const configPath = join(process.cwd(), 'firebase-applet-config.json');
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);

    assert.equal(
      parsed.googleCalendarApiKey,
      'AIzaSyDZFq6pp77Kp9zMSKVQSY-wb8xlWCcEcS8',
      'googleCalendarApiKey must match configured key'
    );
  });

  it('2. verifies fcmApiKey is recorded in firebase-applet-config.json', () => {
    const configPath = join(process.cwd(), 'firebase-applet-config.json');
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);

    assert.equal(
      parsed.fcmApiKey,
      'AIzaSyC9JOdO981WILoxGBjlIf1-hA-dRKkE0Fk',
      'fcmApiKey must match configured key'
    );
  });

  it('3. retrieves calendar API key via getGoogleCalendarApiKey()', () => {
    const key = getGoogleCalendarApiKey();
    assert.equal(
      key,
      'AIzaSyDZFq6pp77Kp9zMSKVQSY-wb8xlWCcEcS8',
      'getGoogleCalendarApiKey() must return the configured Calendar API key'
    );
  });

  it('4. retrieves Firebase Cloud Messaging API key via getFirebaseMessagingApiKey()', () => {
    const key = getFirebaseMessagingApiKey();
    assert.equal(
      key,
      'AIzaSyC9JOdO981WILoxGBjlIf1-hA-dRKkE0Fk',
      'getFirebaseMessagingApiKey() must return the configured FCM API key'
    );
  });
});

