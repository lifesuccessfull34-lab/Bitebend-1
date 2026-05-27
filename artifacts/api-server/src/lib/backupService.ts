/**
 * backupService.ts
 *
 * Interface-only backup service abstraction.
 * Designed for multiple future providers: local filesystem, AWS S3, Supabase Storage, Cloudflare R2.
 *
 * No implementation yet — providers are stubs.
 * To add a real provider, implement BackupService and register it in createBackupService().
 */

export type BackupProvider = "local" | "s3" | "supabase" | "r2";

export interface BackupMetadata {
  id: string;
  createdAt: Date;
  sizeBytes: number;
  provider: BackupProvider;
  label?: string;
  databaseName?: string;
}

export interface BackupResult {
  success: boolean;
  metadata?: BackupMetadata;
  error?: string;
  durationMs?: number;
}

export interface BackupService {
  /**
   * Create a full database backup (pg_dump).
   * @param label  Optional human-readable label for this backup snapshot.
   * @returns BackupResult with metadata if successful, error string if not.
   */
  createBackup(label?: string): Promise<BackupResult>;

  /**
   * Restore the database from a previously created backup.
   * @param id  The backup ID returned by createBackup or listBackups.
   * @returns BackupResult indicating success or failure.
   */
  restoreBackup(id: string): Promise<BackupResult>;

  /**
   * List all available backups in reverse chronological order.
   * @returns Array of BackupMetadata, newest first.
   */
  listBackups(): Promise<BackupMetadata[]>;
}

// ── Provider stub: local filesystem ──────────────────────────────────────────

class LocalBackupService implements BackupService {
  async createBackup(_label?: string): Promise<BackupResult> {
    return { success: false, error: "LocalBackupService not yet implemented. Use pg_dump manually — see docs/database-backup.md" };
  }

  async restoreBackup(_id: string): Promise<BackupResult> {
    return { success: false, error: "LocalBackupService not yet implemented." };
  }

  async listBackups(): Promise<BackupMetadata[]> {
    return [];
  }
}

// ── Provider stub: AWS S3 ─────────────────────────────────────────────────────

class S3BackupService implements BackupService {
  async createBackup(_label?: string): Promise<BackupResult> {
    return { success: false, error: "S3BackupService not yet implemented. Set AWS_S3_BACKUP_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY." };
  }

  async restoreBackup(_id: string): Promise<BackupResult> {
    return { success: false, error: "S3BackupService not yet implemented." };
  }

  async listBackups(): Promise<BackupMetadata[]> {
    return [];
  }
}

// ── Provider stub: Supabase Storage ──────────────────────────────────────────

class SupabaseBackupService implements BackupService {
  async createBackup(_label?: string): Promise<BackupResult> {
    return { success: false, error: "SupabaseBackupService not yet implemented. Set SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_BACKUP_BUCKET." };
  }

  async restoreBackup(_id: string): Promise<BackupResult> {
    return { success: false, error: "SupabaseBackupService not yet implemented." };
  }

  async listBackups(): Promise<BackupMetadata[]> {
    return [];
  }
}

// ── Provider stub: Cloudflare R2 ─────────────────────────────────────────────

class R2BackupService implements BackupService {
  async createBackup(_label?: string): Promise<BackupResult> {
    return { success: false, error: "R2BackupService not yet implemented. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BACKUP_BUCKET." };
  }

  async restoreBackup(_id: string): Promise<BackupResult> {
    return { success: false, error: "R2BackupService not yet implemented." };
  }

  async listBackups(): Promise<BackupMetadata[]> {
    return [];
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Returns a BackupService instance for the configured provider.
 * Provider is resolved from the BACKUP_PROVIDER environment variable,
 * falling back to "local" if not set.
 *
 * @example
 *   const svc = createBackupService();
 *   const result = await svc.createBackup("pre-deploy");
 */
export function createBackupService(provider?: BackupProvider): BackupService {
  const resolved: BackupProvider =
    provider ??
    (process.env["BACKUP_PROVIDER"] as BackupProvider | undefined) ??
    "local";

  switch (resolved) {
    case "s3":       return new S3BackupService();
    case "supabase": return new SupabaseBackupService();
    case "r2":       return new R2BackupService();
    case "local":
    default:         return new LocalBackupService();
  }
}
