import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { databaseUrl } from '@classroom/shared';
export function createDatabase(value: string | undefined) {
  const pool = new Pool({ connectionString: databaseUrl(value), max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000, statement_timeout: 5000, query_timeout: 6000 });
  return { db: drizzle(pool), pool, close: () => pool.end() };
}
export {
  createAuthRepository,
  type AuthenticatedUser,
  type GitHubIdentityInput,
} from './auth.js';
export {
  createInstitutionAccessRepository,
  type AccessRequestRole,
  type AccessRequestStatus,
  type CancelAccessRequestResult,
  type InstitutionSummary,
  type MyAccessRequest,
  type MyRequestMessage,
  type SubmitAccessRequestInput,
  type SubmitAccessRequestResult,
} from './access.js';

export {
  createAdminRepository,
  type AssignableInstitutionRole,
  type InstitutionMember,
  type InstitutionMembersResult,
  type PendingAccessRequest,
  type PendingAccessRequestsResult,
  type AccessDecisionResult,
  type AuditLogEntry,
  type InstitutionDomain,
  type InstitutionOverview,
  type MembershipChangeResult,
  type AccessRequestListStatus,
  type RequestMessage,
} from './admin.js';

export {
  createAcademicRepository,
  type Activity,
  type ActivityInput,
  type ActivityKind,
  type ActivityStatus,
  type CourseCandidate,
  type CourseDetail,
  type CourseMember,
  type CourseRole,
  type CourseStatus,
  type CourseSummary,
  type StudentActivity,
  type StudentDashboard,
  type StudentSubmissionStatus,
  type Submission,
  type SubmissionInput,
  type SubmissionState,
  type TeacherDashboard,
  type UserProfile,
} from './academic.js';

export {
  createPlatformRepository,
  type AssignAdminResult,
  type CreateInstitutionResult,
  type PlatformInstitution,
} from './platform.js';
