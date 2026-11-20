import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const institutionRoleEnum = pgEnum('institution_role', [
  'ADMIN',
  'TEACHER',
  'STUDENT',
]);

export const academicIdentityStatusEnum = pgEnum(
  'academic_identity_status',
  ['PENDING', 'VERIFIED', 'REJECTED'],
);

export const institutionMembershipStatusEnum = pgEnum(
  'institution_membership_status',
  ['ACTIVE', 'SUSPENDED', 'REVOKED'],
);

export const institutionAccessRequestStatusEnum = pgEnum(
  'institution_access_request_status',
  ['PENDING', 'APPROVED', 'DENIED', 'CANCELLED'],
);

export const institutionAccessRoleEnum = pgEnum(
  'institution_access_role',
  ['TEACHER', 'STUDENT'],
);

export const accessRequestEventActionEnum = pgEnum(
  'access_request_event_action',
  ['SUBMITTED', 'APPROVED', 'DENIED', 'CANCELLED'],
);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name'),
  // Private: never returned to other users.
  contactEmail: text('contact_email'),
  notifyDeadlines: boolean('notify_deadlines').notNull().default(true),
  notifyFeedback: boolean('notify_feedback').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const githubIdentities = pgTable(
  'github_identities',
  {
    githubUserId: bigint('github_user_id', { mode: 'bigint' }).primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),

    login: text('login').notNull(),
    avatarUrl: text('avatar_url'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('github_identities_user_id_unique').on(table.userId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),

    secretHash: text('secret_hash').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),

    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('sessions_secret_hash_unique').on(table.secretHash),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const oauthAttempts = pgTable(
  'oauth_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    stateHash: text('state_hash').notNull(),
    bindingHash: text('binding_hash').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('oauth_attempts_state_hash_unique').on(table.stateHash),
    index('oauth_attempts_expires_at_idx').on(table.expiresAt),
  ],
);
export const institutions = pgTable(
  'institutions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    logoUrl: text('logo_url'),
    accentColor: text('accent_color'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('institutions_slug_unique').on(table.slug),
  ],
);

export const academicIdentities = pgTable(
  'academic_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),

    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id),

    institutionalIdentifier: text('institutional_identifier').notNull(),

    status: academicIdentityStatusEnum('status').notNull().default('PENDING'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('academic_identities_user_institution_unique').on(
      table.userId,
      table.institutionId,
    ),
    uniqueIndex('academic_identities_identifier_unique').on(
      table.institutionId,
      table.institutionalIdentifier,
    ),
    index('academic_identities_institution_idx').on(table.institutionId),
  ],
);

export const institutionMemberships = pgTable(
  'institution_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),

    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id),

    role: institutionRoleEnum('role').notNull(),
    status: institutionMembershipStatusEnum('status').notNull().default('ACTIVE'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('institution_memberships_user_institution_role_unique').on(
      table.userId,
      table.institutionId,
      table.role,
    ),
    index('institution_memberships_institution_idx').on(table.institutionId),
    index('institution_memberships_user_idx').on(table.userId),
  ],
);


export const institutionAccessRequests = pgTable(
  'institution_access_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),

    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id),

    status: institutionAccessRequestStatusEnum('status')
      .notNull()
      .default('PENDING'),

    assignedRole: institutionAccessRoleEnum('assigned_role'),

    // Nullable only because rows created before the request form have no data.
    requestedRole: institutionAccessRoleEnum('requested_role'),
    fullName: text('full_name'),
    contactEmail: text('contact_email'),
    institutionalEmail: text('institutional_email'),
    institutionalCode: text('institutional_code'),
    requestReason: text('request_reason'),
    decisionReason: text('decision_reason'),

    decidedByUserId: uuid('decided_by_user_id')
      .references(() => users.id),

    decidedAt: timestamp('decided_at', {
      withTimezone: true,
    }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex(
      'institution_access_requests_one_pending_unique',
    )
      .on(
        table.userId,
        table.institutionId,
      )
      .where(sql`${table.status} = 'PENDING'`),
    index(
      'institution_access_requests_institution_status_idx',
    ).on(
      table.institutionId,
      table.status,
    ),
    index(
      'institution_access_requests_user_idx',
    ).on(table.userId),

    check(
      'institution_access_requests_decision_shape_check',
      sql`
        (
          (
            ${table.status} = 'PENDING'
            AND ${table.assignedRole} IS NULL
            AND ${table.decidedByUserId} IS NULL
            AND ${table.decidedAt} IS NULL
          )
          OR
          (
            ${table.status} = 'APPROVED'
            AND ${table.assignedRole} IS NOT NULL
            AND ${table.decidedByUserId} IS NOT NULL
            AND ${table.decidedAt} IS NOT NULL
          )
          OR
          (
            ${table.status} = 'DENIED'
            AND ${table.assignedRole} IS NULL
            AND ${table.decidedByUserId} IS NOT NULL
            AND ${table.decidedAt} IS NOT NULL
          )
          OR
          (
            ${table.status}::text = 'CANCELLED'
            AND ${table.assignedRole} IS NULL
            AND ${table.decidedByUserId} IS NULL
            AND ${table.decidedAt} IS NOT NULL
          )
        )
      `,
    ),
  ],
);

export const accessRequestEvents = pgTable(
  'access_request_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    requestId: uuid('request_id')
      .notNull()
      .references(() => institutionAccessRequests.id),

    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),

    action: accessRequestEventActionEnum('action').notNull(),
    reason: text('reason'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('access_request_events_request_idx').on(table.requestId),
  ],
);

export const institutionDomains = pgTable(
  'institution_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id),

    domain: text('domain').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('institution_domains_institution_domain_unique').on(
      table.institutionId,
      table.domain,
    ),
  ],
);

export const institutionAuditActionEnum = pgEnum(
  'institution_audit_action',
  [
    'MEMBERSHIP_REVOKED',
    'MEMBERSHIP_ROLE_CHANGED',
    'INSTITUTION_UPDATED',
    'DOMAIN_ADDED',
    'DOMAIN_REMOVED',
    'INSTITUTION_CREATED',
  ],
);

export const institutionAuditEvents = pgTable(
  'institution_audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id),

    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),

    action: institutionAuditActionEnum('action').notNull(),

    targetUserId: uuid('target_user_id').references(() => users.id),

    details: text('details'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('institution_audit_events_institution_created_idx').on(
      table.institutionId,
      table.createdAt,
    ),
  ],
);

export const accessRequestMessages = pgTable(
  'access_request_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    requestId: uuid('request_id')
      .notNull()
      .references(() => institutionAccessRequests.id),

    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),

    // Whether the author wrote as the institution's admin or as the requester.
    fromAdmin: boolean('from_admin').notNull(),

    body: text('body').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('access_request_messages_request_idx').on(
      table.requestId,
      table.createdAt,
    ),
  ],
);

export const courseStatusEnum = pgEnum('course_status', [
  'ACTIVE',
  'ARCHIVED',
]);

export const courseMemberRoleEnum = pgEnum('course_member_role', [
  'TEACHER',
  'STUDENT',
]);

export const courseMemberStatusEnum = pgEnum('course_member_status', [
  'ACTIVE',
  'REMOVED',
]);

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id),

    name: text('name').notNull(),
    code: text('code'),
    description: text('description'),
    status: courseStatusEnum('status').notNull().default('ACTIVE'),

    joinCode: text('join_code').notNull(),
    joinEnabled: boolean('join_enabled').notNull().default(true),

    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('courses_join_code_unique').on(table.joinCode),
    index('courses_institution_idx').on(table.institutionId),
  ],
);

export const courseMembers = pgTable(
  'course_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),

    role: courseMemberRoleEnum('role').notNull(),
    status: courseMemberStatusEnum('status').notNull().default('ACTIVE'),
    groupName: text('group_name'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('course_members_course_user_unique').on(
      table.courseId,
      table.userId,
    ),
    index('course_members_user_idx').on(table.userId),
  ],
);

export const activityStatusEnum = pgEnum('activity_status', [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
]);

export const activityKindEnum = pgEnum('activity_kind', [
  'REPOSITORY',
  'LINK',
  'TEXT',
]);

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id),

    title: text('title').notNull(),
    instructions: text('instructions').notNull(),
    rubric: text('rubric'),
    kind: activityKindEnum('kind').notNull(),
    templateRepoUrl: text('template_repo_url'),
    resourceUrl: text('resource_url'),
    maxScore: integer('max_score'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    allowLate: boolean('allow_late').notNull().default(true),
    status: activityStatusEnum('status').notNull().default('DRAFT'),

    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('activities_course_idx').on(table.courseId),
  ],
);

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id),

    studentUserId: uuid('student_user_id')
      .notNull()
      .references(() => users.id),

    attempt: integer('attempt').notNull(),
    contentUrl: text('content_url'),
    commitSha: text('commit_sha'),
    textContent: text('text_content'),
    isLate: boolean('is_late').notNull(),

    feedback: text('feedback'),
    score: numeric('score', { precision: 6, scale: 2 }),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),

    submittedAt: timestamp('submitted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('submissions_activity_student_attempt_unique').on(
      table.activityId,
      table.studentUserId,
      table.attempt,
    ),
    index('submissions_student_idx').on(table.studentUserId),
  ],
);

export const assignmentRepositories = pgTable('assignment_repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  activityId: uuid('activity_id').notNull().references(() => activities.id),
  studentId: uuid('student_id').notNull().references(() => users.id),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  template: text('template').notNull(),
  repositoryUrl: text('repository_url'),
}, table => [
  uniqueIndex('assignment_repository_student').on(table.activityId, table.studentId),
  uniqueIndex('assignment_repository_name').on(table.owner, table.name),
]);
