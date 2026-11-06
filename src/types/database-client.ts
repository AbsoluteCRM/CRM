import type { Database as GeneratedDatabase } from './database'

type Functions = GeneratedDatabase['public']['Functions']

// The generator omits nullable RPC arguments. These two functions explicitly
// accept null to clear assignments (20261014180000_crew_builder_mutations.sql).
export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedDatabase['public'], 'Functions'> & {
    Functions: Omit<Functions, 'move_crew_member' | 'set_crew_lead'> & {
      move_crew_member: Omit<Functions['move_crew_member'], 'Args'> & {
        Args: Omit<Functions['move_crew_member']['Args'], 'p_crew_id'> & {
          p_crew_id: string | null
        }
      }
      set_crew_lead: Omit<Functions['set_crew_lead'], 'Args'> & {
        Args: Omit<Functions['set_crew_lead']['Args'], 'p_member_id'> & {
          p_member_id: string | null
        }
      }
    }
  }
}
