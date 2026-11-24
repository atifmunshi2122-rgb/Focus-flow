import { Router, Request, Response } from 'express';
import { googleCalendarService } from '../integrations/googleCalendarService.js';

export const googleCalendarOAuthCallbackRouter = Router();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serializeJsString(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

/**
 * Public OAuth redirect callback endpoint.
 * Authenticates via single-use, expiring state nonce bound cryptographically to user UID.
 */
googleCalendarOAuthCallbackRouter.get(
  '/integrations/google-calendar/oauth/callback',
  async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;

    if (error) {
      const escapedErr = String(error).replace(/[^a-zA-Z0-9_-]/g, '');
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Google Calendar Authorization Failed</title></head>
          <body style="font-family: system-ui, sans-serif; text-align: center; padding: 40px;">
            <h2>Authorization Denied</h2>
            <p>Google authorization error: ${escapeHtml(escapedErr)}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_CALENDAR_AUTH_ERROR', error: ${serializeJsString(escapedErr)} }, window.location.origin);
                setTimeout(() => window.close(), 2000);
              }
            </script>
          </body>
        </html>
      `);
      return;
    }

    if (!code || !state) {
      res.status(400).json({
        error: 'Missing code or state parameter in OAuth callback',
        code: 'INVALID_CALLBACK_PARAMS',
      });
      return;
    }

    try {
      await googleCalendarService.handleOAuthCallback(code, state);

      res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Google Calendar Connected</title></head>
          <body style="font-family: system-ui, sans-serif; text-align: center; padding: 40px;">
            <h2 style="color: #16a34a;">Google Calendar Connected!</h2>
            <p>Your calendar integration is now active. This window will close automatically.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_CALENDAR_CONNECTED', success: true }, window.location.origin);
                setTimeout(() => window.close(), 1000);
              } else {
                window.location.href = '/?tab=settings&calendar=connected';
              }
            </script>
          </body>
        </html>
      `);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown callback error';
      console.error('[GoogleCalendarOAuth] Callback failed:', err);
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Google Calendar Connection Failed</title></head>
          <body style="font-family: system-ui, sans-serif; text-align: center; padding: 40px;">
            <h2 style="color: #dc2626;">Connection Failed</h2>
            <p>${escapeHtml(errMsg)}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_CALENDAR_AUTH_ERROR', error: ${serializeJsString(errMsg)} }, window.location.origin);
                setTimeout(() => window.close(), 3000);
              }
            </script>
          </body>
        </html>
      `);
    }
  }
);
