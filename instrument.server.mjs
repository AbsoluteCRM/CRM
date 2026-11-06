import * as Sentry from '@sentry/tanstackstart-react'

// Native Node loading keeps private variables out of Vite's browser environment.
// Existing deployment environment values take precedence over local files.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

export function redactInvitationData(value) {
  if (typeof value === 'string')
    return (
      value
        // The router decodes percent-encoded path credentials before validation.
        // Redact the whole quote-link segment in telemetry, in either encoding.
        .replace(/(\/q\/)[^/?#\s"'<>]+/gi, '$1[redacted]')
        .replace(/((?:^|[?&])(?:token|code)=)[^&\s"']*/gi, '$1[redacted]')
        .replace(/\b[a-f0-9]{64}\b/gi, '[redacted]')
        .replace(
          /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+(?:@|%40)[a-z0-9.-]+\.[a-z]{2,}/gi,
          '[email redacted]',
        )
    )
  if (Array.isArray(value)) return value.map(redactInvitationData)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /^(token|code|key)$/i.test(key)
          ? '[redacted]'
          : redactInvitationData(item),
      ]),
    )
  return value
}

const sentryDsn =
  import.meta.env?.VITE_SENTRY_DSN ?? process.env.VITE_SENTRY_DSN

if (!sentryDsn) {
  console.warn('VITE_SENTRY_DSN is not defined. Sentry is not running.')
} else {
  Sentry.init({
    dsn: sentryDsn,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
    tracesSampleRate: 0.1,
    beforeSend: redactInvitationData,
    beforeSendTransaction: redactInvitationData,
  })
}
