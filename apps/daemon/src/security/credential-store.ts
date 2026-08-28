import type { DaemonDatabase } from '../store/database'

export type DangerousCredential = {
  credentialId: string
  publicKeySpki: string
  userId: string
}

export class DangerousCredentialStore {
  private readonly database: DaemonDatabase

  constructor(database: DaemonDatabase) {
    this.database = database
  }

  read(): DangerousCredential | null {
    return (
      this.database.sqlite
        .query<DangerousCredential, []>(
          `SELECT credential_id AS credentialId, public_key_spki AS publicKeySpki,
                  user_id AS userId
           FROM dangerous_credential WHERE id = 1`
        )
        .get() ?? null
    )
  }

  save(credential: DangerousCredential): void {
    this.database.sqlite
      .query(
        `INSERT INTO dangerous_credential(
           id, credential_id, public_key_spki, user_id, created_at
         ) VALUES (1, ?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET credential_id = excluded.credential_id,
           public_key_spki = excluded.public_key_spki, user_id = excluded.user_id,
           created_at = excluded.created_at`
      )
      .run(credential.credentialId, credential.publicKeySpki, credential.userId, Date.now())
  }

  remove(): void {
    this.database.sqlite.query('DELETE FROM dangerous_credential WHERE id = 1').run()
  }
}
