# Auditing

Monitor and log access to your data for security and compliance.

## Why Audit?

- **Security monitoring** - Detect unauthorized access attempts
- **Compliance** - Meet regulatory requirements (GDPR, HIPAA, SOC2)
- **Debugging** - Understand why policies behave unexpectedly
- **Analytics** - Track usage patterns

## Access Logging

### Basic Access Log Table

```sql
CREATE TABLE access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  row_id UUID,
  user_id UUID,
  action TEXT NOT NULL,  -- SELECT, INSERT, UPDATE, DELETE
  success BOOLEAN NOT NULL,
  ip_address INET,
  user_agent TEXT,
  query_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying
CREATE INDEX idx_access_logs_user ON access_logs(user_id, created_at);
CREATE INDEX idx_access_logs_table ON access_logs(table_name, created_at);
```

### Logging Trigger

```sql
CREATE OR REPLACE FUNCTION log_table_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO access_logs (
    table_name,
    row_id,
    user_id,
    action,
    success,
    ip_address
  ) VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    auth.uid(),
    TG_OP,
    true,
    inet_client_addr()
  );
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Apply to sensitive tables
CREATE TRIGGER audit_sensitive_data
  AFTER INSERT OR UPDATE OR DELETE ON sensitive_data
  FOR EACH ROW EXECUTE FUNCTION log_table_access();
```

## Policy Decision Logging

### Log When Access Denied

```sql
CREATE OR REPLACE FUNCTION log_denied_access(
  p_table TEXT,
  p_row_id UUID,
  p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO access_logs (
    table_name,
    row_id,
    user_id,
    action,
    success,
    query_hash
  ) VALUES (
    p_table,
    p_row_id,
    auth.uid(),
    'DENIED',
    false,
    p_reason
  );
  RETURN false;  -- Always return false for policy
END;
$$;

-- Use in policy (for debugging)
CREATE POLICY logged_access ON resources
  FOR SELECT
  USING (
    CASE
      WHEN owner_id = auth.uid() THEN true
      ELSE log_denied_access('resources', id, 'not_owner')
    END
  );
```

## Query Monitoring

### Track Slow Queries

```sql
-- Enable query logging in postgresql.conf
-- log_min_duration_statement = 1000  -- Log queries > 1s

-- Or use pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Query slow statements
SELECT
  query,
  calls,
  mean_time,
  max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 20;
```

### RLS-Specific Monitoring

```sql
-- Check policy usage
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'your_table';
```

## Compliance Reporting

### Data Access Report

```sql
-- Who accessed what data in the last 30 days
SELECT
  u.email,
  al.table_name,
  al.action,
  COUNT(*) as access_count,
  MAX(al.created_at) as last_access
FROM access_logs al
JOIN users u ON u.id = al.user_id
WHERE al.created_at > NOW() - INTERVAL '30 days'
GROUP BY u.email, al.table_name, al.action
ORDER BY access_count DESC;
```

### Failed Access Attempts

```sql
-- Potential security issues
SELECT
  user_id,
  table_name,
  COUNT(*) as denied_count,
  MAX(created_at) as last_attempt
FROM access_logs
WHERE success = false
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY user_id, table_name
HAVING COUNT(*) > 10
ORDER BY denied_count DESC;
```

## Real-Time Alerting

### PostgreSQL NOTIFY

```sql
CREATE OR REPLACE FUNCTION alert_suspicious_access()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Alert on high-frequency access
  IF (
    SELECT COUNT(*)
    FROM access_logs
    WHERE user_id = NEW.user_id
      AND created_at > NOW() - INTERVAL '1 minute'
  ) > 100 THEN
    PERFORM pg_notify('security_alert', json_build_object(
      'type', 'high_frequency',
      'user_id', NEW.user_id,
      'table', NEW.table_name
    )::text);
  END IF;
  
  RETURN NEW;
END;
$$;
```

### Application Integration

```typescript
// Listen for security alerts
const client = new Client(connectionString);
await client.connect();
await client.query('LISTEN security_alert');

client.on('notification', (msg) => {
  const alert = JSON.parse(msg.payload);
  sendSecurityAlert(alert);
});
```

## Log Retention

### Automatic Cleanup

```sql
-- Delete old logs
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM access_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;

-- Schedule with pg_cron
SELECT cron.schedule('0 3 * * *', $$SELECT cleanup_old_logs()$$);
```

### Archive Before Delete

```sql
-- Move to archive table first
CREATE TABLE access_logs_archive (LIKE access_logs INCLUDING ALL);

CREATE OR REPLACE FUNCTION archive_old_logs()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO access_logs_archive
  SELECT * FROM access_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  DELETE FROM access_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;
```

## Next Steps

- [Testing Policies](/guide/testing-policies) - Write security tests
- [Security Best Practices](/guide/security-best-practices) - Secure your implementation

