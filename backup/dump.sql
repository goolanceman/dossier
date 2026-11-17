--
-- PostgreSQL database dump
--

\restrict b08LOl7BQ7ISLasu0oY0ngd9aZOoTfTllnOckacGhFOC6BrNHzi4HsBkQ1t2Dqb

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public."StatusEvent" DROP CONSTRAINT IF EXISTS "StatusEvent_applicationId_fkey";
ALTER TABLE IF EXISTS ONLY public."Startup" DROP CONSTRAINT IF EXISTS "Startup_applicationId_fkey";
ALTER TABLE IF EXISTS ONLY public."ProjectSkill" DROP CONSTRAINT IF EXISTS "ProjectSkill_skillId_fkey";
ALTER TABLE IF EXISTS ONLY public."ProjectSkill" DROP CONSTRAINT IF EXISTS "ProjectSkill_projectId_fkey";
ALTER TABLE IF EXISTS ONLY public."Posting" DROP CONSTRAINT IF EXISTS "Posting_applicationId_fkey";
ALTER TABLE IF EXISTS ONLY public."Note" DROP CONSTRAINT IF EXISTS "Note_applicationId_fkey";
ALTER TABLE IF EXISTS ONLY public."Job" DROP CONSTRAINT IF EXISTS "Job_applicationId_fkey";
ALTER TABLE IF EXISTS ONLY public."Fact" DROP CONSTRAINT IF EXISTS "Fact_applicationId_fkey";
ALTER TABLE IF EXISTS ONLY public."ExperienceSkill" DROP CONSTRAINT IF EXISTS "ExperienceSkill_skillId_fkey";
ALTER TABLE IF EXISTS ONLY public."ExperienceSkill" DROP CONSTRAINT IF EXISTS "ExperienceSkill_experienceId_fkey";
ALTER TABLE IF EXISTS ONLY public."EmailMessage" DROP CONSTRAINT IF EXISTS "EmailMessage_applicationId_fkey";
ALTER TABLE IF EXISTS ONLY public."Document" DROP CONSTRAINT IF EXISTS "Document_themeId_fkey";
ALTER TABLE IF EXISTS ONLY public."Document" DROP CONSTRAINT IF EXISTS "Document_applicationId_fkey";
ALTER TABLE IF EXISTS ONLY public."DocumentVersion" DROP CONSTRAINT IF EXISTS "DocumentVersion_documentId_fkey";
ALTER TABLE IF EXISTS ONLY public."ChatMessage" DROP CONSTRAINT IF EXISTS "ChatMessage_applicationId_fkey";
ALTER TABLE IF EXISTS ONLY public."AgentCandidate" DROP CONSTRAINT IF EXISTS "AgentCandidate_applicationId_fkey";
DROP TRIGGER IF EXISTS "Theme_prevent_builtin_delete" ON public."Theme";
DROP INDEX IF EXISTS public."StatusEvent_applicationId_at_idx";
DROP INDEX IF EXISTS public."Startup_status_score_idx";
DROP INDEX IF EXISTS public."Startup_source_externalId_key";
DROP INDEX IF EXISTS public."Startup_applicationId_key";
DROP INDEX IF EXISTS public."Skill_name_key";
DROP INDEX IF EXISTS public."ProjectSkill_skillId_idx";
DROP INDEX IF EXISTS public."Posting_source_externalId_key";
DROP INDEX IF EXISTS public."Posting_savedAt_idx";
DROP INDEX IF EXISTS public."Posting_dismissedAt_idx";
DROP INDEX IF EXISTS public."Posting_applicationId_key";
DROP INDEX IF EXISTS public."PostingSearch_createdAt_idx";
DROP INDEX IF EXISTS public."Note_applicationId_createdAt_idx";
DROP INDEX IF EXISTS public."LoginThrottle_updatedAt_idx";
DROP INDEX IF EXISTS public."Language_name_key";
DROP INDEX IF EXISTS public."Job_status_idx";
DROP INDEX IF EXISTS public."Job_key_createdAt_idx";
DROP INDEX IF EXISTS public."Job_applicationId_idx";
DROP INDEX IF EXISTS public."Fact_applicationId_sort_idx";
DROP INDEX IF EXISTS public."ExperienceSkill_skillId_idx";
DROP INDEX IF EXISTS public."EmailMessage_threadId_idx";
DROP INDEX IF EXISTS public."EmailMessage_sentAt_idx";
DROP INDEX IF EXISTS public."EmailMessage_gmailId_key";
DROP INDEX IF EXISTS public."EmailMessage_applicationId_sentAt_idx";
DROP INDEX IF EXISTS public."Document_applicationId_kind_key";
DROP INDEX IF EXISTS public."DocumentVersion_documentId_createdAt_idx";
DROP INDEX IF EXISTS public."ClaudePaste_expiresAt_idx";
DROP INDEX IF EXISTS public."ChatMessage_applicationId_createdAt_idx";
DROP INDEX IF EXISTS public."Application_updatedAt_idx";
DROP INDEX IF EXISTS public."Application_status_idx";
DROP INDEX IF EXISTS public."AgentCandidate_status_score_idx";
DROP INDEX IF EXISTS public."AgentCandidate_source_externalId_key";
DROP INDEX IF EXISTS public."AgentCandidate_dedupeKey_key";
DROP INDEX IF EXISTS public."AgentCandidate_createdAt_idx";
DROP INDEX IF EXISTS public."AgentCandidate_applicationId_key";
ALTER TABLE IF EXISTS ONLY public._prisma_migrations DROP CONSTRAINT IF EXISTS _prisma_migrations_pkey;
ALTER TABLE IF EXISTS ONLY public."Theme" DROP CONSTRAINT IF EXISTS "Theme_pkey";
ALTER TABLE IF EXISTS ONLY public."StatusEvent" DROP CONSTRAINT IF EXISTS "StatusEvent_pkey";
ALTER TABLE IF EXISTS ONLY public."Startup" DROP CONSTRAINT IF EXISTS "Startup_pkey";
ALTER TABLE IF EXISTS ONLY public."StartupBlock" DROP CONSTRAINT IF EXISTS "StartupBlock_pkey";
ALTER TABLE IF EXISTS ONLY public."Skill" DROP CONSTRAINT IF EXISTS "Skill_pkey";
ALTER TABLE IF EXISTS ONLY public."Setting" DROP CONSTRAINT IF EXISTS "Setting_pkey";
ALTER TABLE IF EXISTS ONLY public."Reference" DROP CONSTRAINT IF EXISTS "Reference_pkey";
ALTER TABLE IF EXISTS ONLY public."Publication" DROP CONSTRAINT IF EXISTS "Publication_pkey";
ALTER TABLE IF EXISTS ONLY public."Project" DROP CONSTRAINT IF EXISTS "Project_pkey";
ALTER TABLE IF EXISTS ONLY public."ProjectSkill" DROP CONSTRAINT IF EXISTS "ProjectSkill_pkey";
ALTER TABLE IF EXISTS ONLY public."ProfileField" DROP CONSTRAINT IF EXISTS "ProfileField_pkey";
ALTER TABLE IF EXISTS ONLY public."Posting" DROP CONSTRAINT IF EXISTS "Posting_pkey";
ALTER TABLE IF EXISTS ONLY public."PostingSearch" DROP CONSTRAINT IF EXISTS "PostingSearch_pkey";
ALTER TABLE IF EXISTS ONLY public."PostingScore" DROP CONSTRAINT IF EXISTS "PostingScore_pkey";
ALTER TABLE IF EXISTS ONLY public."Note" DROP CONSTRAINT IF EXISTS "Note_pkey";
ALTER TABLE IF EXISTS ONLY public."LoginThrottle" DROP CONSTRAINT IF EXISTS "LoginThrottle_pkey";
ALTER TABLE IF EXISTS ONLY public."Language" DROP CONSTRAINT IF EXISTS "Language_pkey";
ALTER TABLE IF EXISTS ONLY public."Job" DROP CONSTRAINT IF EXISTS "Job_pkey";
ALTER TABLE IF EXISTS ONLY public."GoogleAccount" DROP CONSTRAINT IF EXISTS "GoogleAccount_pkey";
ALTER TABLE IF EXISTS ONLY public."Fact" DROP CONSTRAINT IF EXISTS "Fact_pkey";
ALTER TABLE IF EXISTS ONLY public."Experience" DROP CONSTRAINT IF EXISTS "Experience_pkey";
ALTER TABLE IF EXISTS ONLY public."ExperienceSkill" DROP CONSTRAINT IF EXISTS "ExperienceSkill_pkey";
ALTER TABLE IF EXISTS ONLY public."EmailMessage" DROP CONSTRAINT IF EXISTS "EmailMessage_pkey";
ALTER TABLE IF EXISTS ONLY public."Education" DROP CONSTRAINT IF EXISTS "Education_pkey";
ALTER TABLE IF EXISTS ONLY public."Document" DROP CONSTRAINT IF EXISTS "Document_pkey";
ALTER TABLE IF EXISTS ONLY public."DocumentVersion" DROP CONSTRAINT IF EXISTS "DocumentVersion_pkey";
ALTER TABLE IF EXISTS ONLY public."ClaudePaste" DROP CONSTRAINT IF EXISTS "ClaudePaste_pkey";
ALTER TABLE IF EXISTS ONLY public."ChatMessage" DROP CONSTRAINT IF EXISTS "ChatMessage_pkey";
ALTER TABLE IF EXISTS ONLY public."Application" DROP CONSTRAINT IF EXISTS "Application_pkey";
ALTER TABLE IF EXISTS ONLY public."AgentCandidate" DROP CONSTRAINT IF EXISTS "AgentCandidate_pkey";
DROP TABLE IF EXISTS public._prisma_migrations;
DROP TABLE IF EXISTS public."Theme";
DROP TABLE IF EXISTS public."StatusEvent";
DROP TABLE IF EXISTS public."StartupBlock";
DROP TABLE IF EXISTS public."Startup";
DROP TABLE IF EXISTS public."Skill";
DROP TABLE IF EXISTS public."Setting";
DROP TABLE IF EXISTS public."Reference";
DROP TABLE IF EXISTS public."Publication";
DROP TABLE IF EXISTS public."ProjectSkill";
DROP TABLE IF EXISTS public."Project";
DROP TABLE IF EXISTS public."ProfileField";
DROP TABLE IF EXISTS public."PostingSearch";
DROP TABLE IF EXISTS public."PostingScore";
DROP TABLE IF EXISTS public."Posting";
DROP TABLE IF EXISTS public."Note";
DROP TABLE IF EXISTS public."LoginThrottle";
DROP TABLE IF EXISTS public."Language";
DROP TABLE IF EXISTS public."Job";
DROP TABLE IF EXISTS public."GoogleAccount";
DROP TABLE IF EXISTS public."Fact";
DROP TABLE IF EXISTS public."ExperienceSkill";
DROP TABLE IF EXISTS public."Experience";
DROP TABLE IF EXISTS public."EmailMessage";
DROP TABLE IF EXISTS public."Education";
DROP TABLE IF EXISTS public."DocumentVersion";
DROP TABLE IF EXISTS public."Document";
DROP TABLE IF EXISTS public."ClaudePaste";
DROP TABLE IF EXISTS public."ChatMessage";
DROP TABLE IF EXISTS public."Application";
DROP TABLE IF EXISTS public."AgentCandidate";
DROP FUNCTION IF EXISTS public.prevent_builtin_theme_delete();
DROP TYPE IF EXISTS public."VersionCause";
DROP TYPE IF EXISTS public."Tone";
DROP TYPE IF EXISTS public."ThemeLayout";
DROP TYPE IF EXISTS public."ThemeFont";
DROP TYPE IF EXISTS public."ThemeAlign";
DROP TYPE IF EXISTS public."StartupStatus";
DROP TYPE IF EXISTS public."SidebarStyle";
DROP TYPE IF EXISTS public."ReplyKind";
DROP TYPE IF EXISTS public."PostingSource";
DROP TYPE IF EXISTS public."PhotoShape";
DROP TYPE IF EXISTS public."PhotoPosition";
DROP TYPE IF EXISTS public."PaperSize";
DROP TYPE IF EXISTS public."LanguageLevel";
DROP TYPE IF EXISTS public."JobStatus";
DROP TYPE IF EXISTS public."HeadingStyle";
DROP TYPE IF EXISTS public."HeaderStyle";
DROP TYPE IF EXISTS public."FunnelStage";
DROP TYPE IF EXISTS public."EmailDirection";
DROP TYPE IF EXISTS public."DocumentKind";
DROP TYPE IF EXISTS public."Density";
DROP TYPE IF EXISTS public."DateStyle";
DROP TYPE IF EXISTS public."DateFormat";
DROP TYPE IF EXISTS public."Creativity";
DROP TYPE IF EXISTS public."ChatRole";
DROP TYPE IF EXISTS public."ApplicationStatus";
DROP TYPE IF EXISTS public."ApplicationOrigin";
DROP TYPE IF EXISTS public."AiProvider";
DROP TYPE IF EXISTS public."AgentCandidateStatus";
DROP EXTENSION IF EXISTS citext;
--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: AgentCandidateStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AgentCandidateStatus" AS ENUM (
    'SCORED',
    'DRAFTING',
    'DRAFTED',
    'APPROVED',
    'DISMISSED'
);


--
-- Name: AiProvider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AiProvider" AS ENUM (
    'LOCAL',
    'OPENAI',
    'ANTHROPIC',
    'MISTRAL',
    'LMSTUDIO'
);


--
-- Name: ApplicationOrigin; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ApplicationOrigin" AS ENUM (
    'MANUAL',
    'AGENT'
);


--
-- Name: ApplicationStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ApplicationStatus" AS ENUM (
    'DRAFT',
    'SENT',
    'SCREENING',
    'INTERVIEW',
    'OFFER',
    'ACCEPTED',
    'REJECTED',
    'DECLINED'
);


--
-- Name: ChatRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ChatRole" AS ENUM (
    'USER',
    'AI'
);


--
-- Name: Creativity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Creativity" AS ENUM (
    'FAITHFUL',
    'BALANCED',
    'EXPRESSIVE'
);


--
-- Name: DateFormat; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DateFormat" AS ENUM (
    'DAY_MONTH_YEAR',
    'MONTH_DAY_YEAR',
    'NUMERIC'
);


--
-- Name: DateStyle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DateStyle" AS ENUM (
    'INLINE',
    'TIMELINE'
);


--
-- Name: Density; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Density" AS ENUM (
    'COMPACT',
    'REGULAR',
    'AIRY'
);


--
-- Name: DocumentKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentKind" AS ENUM (
    'RESUME',
    'COVER_LETTER',
    'EMAIL'
);


--
-- Name: EmailDirection; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EmailDirection" AS ENUM (
    'OUTGOING',
    'INCOMING'
);


--
-- Name: FunnelStage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FunnelStage" AS ENUM (
    'SENT',
    'SCREENING',
    'INTERVIEW',
    'OFFER',
    'ACCEPTED'
);


--
-- Name: HeaderStyle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."HeaderStyle" AS ENUM (
    'PLAIN',
    'BANNER'
);


--
-- Name: HeadingStyle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."HeadingStyle" AS ENUM (
    'RULE',
    'CAPS',
    'PLAIN',
    'BAR',
    'BAND'
);


--
-- Name: JobStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."JobStatus" AS ENUM (
    'QUEUED',
    'RUNNING',
    'DONE',
    'FAILED'
);


--
-- Name: LanguageLevel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LanguageLevel" AS ENUM (
    'NATIVE',
    'C2',
    'C1',
    'B2',
    'B1',
    'A2',
    'A1'
);


--
-- Name: PaperSize; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PaperSize" AS ENUM (
    'A4',
    'LETTER'
);


--
-- Name: PhotoPosition; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PhotoPosition" AS ENUM (
    'HEADER_END',
    'HEADER_START',
    'ABOVE_NAME',
    'SIDEBAR'
);


--
-- Name: PhotoShape; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PhotoShape" AS ENUM (
    'CIRCLE',
    'ROUNDED',
    'SQUARE',
    'PORTRAIT'
);


--
-- Name: PostingSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PostingSource" AS ENUM (
    'JSEARCH',
    'ADZUNA',
    'ARBEITSAGENTUR',
    'FREEHIRE'
);


--
-- Name: ReplyKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ReplyKind" AS ENUM (
    'REJECTION',
    'INTERVIEW',
    'QUESTION',
    'OFFER',
    'ACKNOWLEDGEMENT',
    'OTHER'
);


--
-- Name: SidebarStyle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SidebarStyle" AS ENUM (
    'PLAIN',
    'TINTED'
);


--
-- Name: StartupStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StartupStatus" AS ENUM (
    'NEW',
    'SAVED',
    'CONTACTED',
    'DISMISSED'
);


--
-- Name: ThemeAlign; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ThemeAlign" AS ENUM (
    'LEFT',
    'CENTER'
);


--
-- Name: ThemeFont; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ThemeFont" AS ENUM (
    'NEWSREADER',
    'GARAMOND',
    'GEIST',
    'PLEX_SANS',
    'PLEX_MONO',
    'SOURCE_SERIF',
    'LORA',
    'LIBRE_CASLON',
    'PLAYFAIR',
    'FRAUNCES',
    'INTER',
    'MANROPE',
    'WORK_SANS',
    'SPACE_GROTESK',
    'JETBRAINS_MONO'
);


--
-- Name: ThemeLayout; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ThemeLayout" AS ENUM (
    'SINGLE',
    'SPLIT',
    'SIDE_HEADINGS',
    'SPLIT_END'
);


--
-- Name: Tone; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Tone" AS ENUM (
    'WARM',
    'DIRECT',
    'FORMAL'
);


--
-- Name: VersionCause; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."VersionCause" AS ENUM (
    'WRITTEN',
    'TRIMMED',
    'REGENERATED',
    'REFINED',
    'UNDONE',
    'BEFORE_RESTORE',
    'RESTORED'
);


--
-- Name: prevent_builtin_theme_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_builtin_theme_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD."builtIn" THEN
    RAISE EXCEPTION 'Built-in theme "%" can''t be deleted.', OLD."name"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AgentCandidate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AgentCandidate" (
    id text NOT NULL,
    source public."PostingSource" NOT NULL,
    "externalId" text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    company text DEFAULT ''::text NOT NULL,
    place text DEFAULT ''::text NOT NULL,
    remote boolean,
    salary text DEFAULT ''::text NOT NULL,
    "postedAt" timestamp(3) without time zone,
    url text DEFAULT ''::text NOT NULL,
    via text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    complete boolean DEFAULT false NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    reasons jsonb,
    "redFlags" jsonb,
    status public."AgentCandidateStatus" DEFAULT 'SCORED'::public."AgentCandidateStatus" NOT NULL,
    error text,
    "applicationId" text,
    "dedupeKey" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Application; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Application" (
    id text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    company text DEFAULT ''::text NOT NULL,
    role text DEFAULT ''::text NOT NULL,
    location text DEFAULT ''::text NOT NULL,
    mode text DEFAULT ''::text NOT NULL,
    salary text DEFAULT ''::text NOT NULL,
    deadline date,
    "postingUrl" text DEFAULT ''::text NOT NULL,
    "postingText" text DEFAULT ''::text NOT NULL,
    extracted jsonb,
    match jsonb,
    status public."ApplicationStatus" DEFAULT 'DRAFT'::public."ApplicationStatus" NOT NULL,
    "furthestStage" public."FunnelStage",
    "sentAt" timestamp(3) without time zone,
    tone public."Tone" DEFAULT 'WARM'::public."Tone" NOT NULL,
    language text DEFAULT ''::text NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "extractedWith" text,
    "matchedWith" text,
    "followThemeLayout" boolean DEFAULT false NOT NULL,
    "nextInterviewAt" timestamp(3) without time zone,
    "emailThreadId" text,
    "interviewCalendarId" text,
    "interviewEventId" text,
    "agentScore" integer,
    "awaitingReview" boolean DEFAULT false NOT NULL,
    origin public."ApplicationOrigin" DEFAULT 'MANUAL'::public."ApplicationOrigin" NOT NULL,
    "showPhoto" boolean
);


--
-- Name: ChatMessage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ChatMessage" (
    id text NOT NULL,
    "applicationId" text NOT NULL,
    role public."ChatRole" NOT NULL,
    text text NOT NULL,
    "targetUnit" text,
    edits jsonb,
    undone boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "writtenWith" text,
    "previousTone" public."Tone"
);


--
-- Name: ClaudePaste; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ClaudePaste" (
    id text NOT NULL,
    text text NOT NULL,
    url text DEFAULT ''::text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Document; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Document" (
    id text NOT NULL,
    "applicationId" text NOT NULL,
    kind public."DocumentKind" NOT NULL,
    units jsonb NOT NULL,
    "themeId" text,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "writtenWith" text,
    trimmed jsonb
);


--
-- Name: DocumentVersion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DocumentVersion" (
    id text NOT NULL,
    "documentId" text NOT NULL,
    units jsonb NOT NULL,
    cause public."VersionCause" NOT NULL,
    detail text DEFAULT ''::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Education; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Education" (
    id text NOT NULL,
    degree text DEFAULT ''::text NOT NULL,
    school text DEFAULT ''::text NOT NULL,
    "startYear" integer,
    "startMonth" integer,
    "endYear" integer,
    "endMonth" integer,
    current boolean DEFAULT false NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: EmailMessage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EmailMessage" (
    id text NOT NULL,
    "gmailId" text NOT NULL,
    "threadId" text NOT NULL,
    "applicationId" text,
    direction public."EmailDirection" NOT NULL,
    "fromName" text DEFAULT ''::text NOT NULL,
    "fromAddress" text DEFAULT ''::text NOT NULL,
    "toAddress" text DEFAULT ''::text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    "messageId" text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    "sentAt" timestamp(3) without time zone NOT NULL,
    kind public."ReplyKind",
    summary text DEFAULT ''::text NOT NULL,
    questions jsonb,
    "suggestedStatus" public."ApplicationStatus",
    "confirmedAt" timestamp(3) without time zone,
    "classifiedWith" text,
    "replyDraft" text DEFAULT ''::text NOT NULL,
    "replyGaps" jsonb,
    "draftedWith" text,
    "handledAt" timestamp(3) without time zone,
    "dismissedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Experience; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Experience" (
    id text NOT NULL,
    role text DEFAULT ''::text NOT NULL,
    company text DEFAULT ''::text NOT NULL,
    location text DEFAULT ''::text NOT NULL,
    "startYear" integer,
    "startMonth" integer,
    "endYear" integer,
    "endMonth" integer,
    current boolean DEFAULT false NOT NULL,
    bullets text DEFAULT ''::text NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    descriptor text DEFAULT ''::text NOT NULL
);


--
-- Name: ExperienceSkill; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ExperienceSkill" (
    "experienceId" text NOT NULL,
    "skillId" text NOT NULL
);


--
-- Name: Fact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Fact" (
    id text NOT NULL,
    "applicationId" text,
    text text DEFAULT ''::text NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: GoogleAccount; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GoogleAccount" (
    id text DEFAULT 'google'::text NOT NULL,
    email text NOT NULL,
    "refreshTokenEnc" text NOT NULL,
    scopes text DEFAULT ''::text NOT NULL,
    "historyId" text,
    "lastSyncAt" timestamp(3) without time zone,
    "syncProblem" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Job; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Job" (
    id text NOT NULL,
    type text NOT NULL,
    key text,
    status public."JobStatus" DEFAULT 'QUEUED'::public."JobStatus" NOT NULL,
    step text,
    input jsonb NOT NULL,
    result jsonb,
    error text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "startedAt" timestamp(3) without time zone,
    "finishedAt" timestamp(3) without time zone,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "applicationId" text
);


--
-- Name: Language; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Language" (
    id text NOT NULL,
    name public.citext NOT NULL,
    level public."LanguageLevel" NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: LoginThrottle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LoginThrottle" (
    key text NOT NULL,
    failures integer DEFAULT 0 NOT NULL,
    "windowStart" timestamp(3) without time zone NOT NULL,
    "blockedUntil" timestamp(3) without time zone,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Note; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Note" (
    id text NOT NULL,
    "applicationId" text NOT NULL,
    body text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Posting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Posting" (
    id text NOT NULL,
    source public."PostingSource" NOT NULL,
    "externalId" text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    company text DEFAULT ''::text NOT NULL,
    place text DEFAULT ''::text NOT NULL,
    remote boolean,
    salary text DEFAULT ''::text NOT NULL,
    "postedAt" timestamp(3) without time zone,
    url text DEFAULT ''::text NOT NULL,
    via text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    complete boolean DEFAULT false NOT NULL,
    "savedAt" timestamp(3) without time zone,
    "dismissedAt" timestamp(3) without time zone,
    "applicationId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PostingScore; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PostingScore" (
    source public."PostingSource" NOT NULL,
    "externalId" text NOT NULL,
    score integer NOT NULL,
    reasons jsonb NOT NULL,
    "redFlags" jsonb NOT NULL,
    "scoredWith" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PostingSearch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PostingSearch" (
    id text NOT NULL,
    source public."PostingSource" NOT NULL,
    query jsonb NOT NULL,
    postings jsonb NOT NULL,
    found integer DEFAULT 0 NOT NULL,
    next text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: ProfileField; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProfileField" (
    key text NOT NULL,
    value text NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Project; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Project" (
    id text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    link text DEFAULT ''::text NOT NULL,
    "startYear" integer,
    "startMonth" integer,
    "endYear" integer,
    "endMonth" integer,
    current boolean DEFAULT false NOT NULL,
    bullets text DEFAULT ''::text NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: ProjectSkill; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProjectSkill" (
    "projectId" text NOT NULL,
    "skillId" text NOT NULL
);


--
-- Name: Publication; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Publication" (
    id text NOT NULL,
    citation text DEFAULT ''::text NOT NULL,
    link text DEFAULT ''::text NOT NULL,
    "onResumes" boolean DEFAULT true NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Reference; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Reference" (
    id text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    relation text DEFAULT ''::text NOT NULL,
    company text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Setting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Setting" (
    key text NOT NULL,
    value text NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Skill; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Skill" (
    id text NOT NULL,
    name public.citext NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "group" text DEFAULT ''::text NOT NULL
);


--
-- Name: Startup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Startup" (
    id text NOT NULL,
    source text NOT NULL,
    "externalId" text NOT NULL,
    company text NOT NULL,
    website text DEFAULT ''::text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    details text DEFAULT ''::text NOT NULL,
    location text DEFAULT ''::text NOT NULL,
    remote boolean,
    stage text DEFAULT ''::text NOT NULL,
    roles jsonb NOT NULL,
    emails jsonb NOT NULL,
    links jsonb NOT NULL,
    "postedAt" timestamp(3) without time zone,
    score integer DEFAULT 0 NOT NULL,
    reasons jsonb NOT NULL,
    "scoredWith" text DEFAULT ''::text NOT NULL,
    status public."StartupStatus" DEFAULT 'NEW'::public."StartupStatus" NOT NULL,
    "noApplicationsFrom" text DEFAULT ''::text NOT NULL,
    "emailsCheckedAt" timestamp(3) without time zone,
    "peopleCheckedAt" timestamp(3) without time zone,
    notes text DEFAULT ''::text NOT NULL,
    "seenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "applicationId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: StartupBlock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StartupBlock" (
    hash text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: StatusEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StatusEvent" (
    id text NOT NULL,
    "applicationId" text NOT NULL,
    "from" public."ApplicationStatus" NOT NULL,
    "to" public."ApplicationStatus" NOT NULL,
    at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "previousFurthestStage" public."FunnelStage",
    "previousSentAt" timestamp(3) without time zone
);


--
-- Name: Theme; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Theme" (
    id text NOT NULL,
    "builtIn" boolean DEFAULT false NOT NULL,
    name text NOT NULL,
    "headFont" public."ThemeFont" NOT NULL,
    "bodyFont" public."ThemeFont" NOT NULL,
    accent text NOT NULL,
    layout public."ThemeLayout" DEFAULT 'SINGLE'::public."ThemeLayout" NOT NULL,
    align public."ThemeAlign" DEFAULT 'LEFT'::public."ThemeAlign" NOT NULL,
    "headingStyle" public."HeadingStyle" DEFAULT 'PLAIN'::public."HeadingStyle" NOT NULL,
    density public."Density" DEFAULT 'REGULAR'::public."Density" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "dateStyle" public."DateStyle" DEFAULT 'INLINE'::public."DateStyle" NOT NULL,
    "headerStyle" public."HeaderStyle" DEFAULT 'PLAIN'::public."HeaderStyle" NOT NULL,
    "sidebarStyle" public."SidebarStyle" DEFAULT 'PLAIN'::public."SidebarStyle" NOT NULL,
    "photoPosition" public."PhotoPosition" DEFAULT 'HEADER_END'::public."PhotoPosition" NOT NULL,
    "photoShape" public."PhotoShape" DEFAULT 'CIRCLE'::public."PhotoShape" NOT NULL
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Data for Name: AgentCandidate; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."AgentCandidate" (id, source, "externalId", title, company, place, remote, salary, "postedAt", url, via, description, complete, score, reasons, "redFlags", status, error, "applicationId", "dedupeKey", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Application; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Application" (id, title, company, role, location, mode, salary, deadline, "postingUrl", "postingText", extracted, match, status, "furthestStage", "sentAt", tone, language, "archivedAt", "createdAt", "updatedAt", "extractedWith", "matchedWith", "followThemeLayout", "nextInterviewAt", "emailThreadId", "interviewCalendarId", "interviewEventId", "agentScore", "awaitingReview", origin, "showPhoto") FROM stdin;
\.


--
-- Data for Name: ChatMessage; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ChatMessage" (id, "applicationId", role, text, "targetUnit", edits, undone, "createdAt", "writtenWith", "previousTone") FROM stdin;
\.


--
-- Data for Name: ClaudePaste; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ClaudePaste" (id, text, url, "expiresAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: Document; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Document" (id, "applicationId", kind, units, "themeId", "updatedAt", "writtenWith", trimmed) FROM stdin;
\.


--
-- Data for Name: DocumentVersion; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."DocumentVersion" (id, "documentId", units, cause, detail, "createdAt") FROM stdin;
\.


--
-- Data for Name: Education; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Education" (id, degree, school, "startYear", "startMonth", "endYear", "endMonth", current, notes, sort, "createdAt", "updatedAt") FROM stdin;
edu_vtu	Bachelor of Science in Computer Science	Visvesvaraya Technological University (VTU), Karnataka, India	2013	\N	2017	\N	f		0	2026-11-03 16:25:33.152	2026-11-03 16:25:33.152
\.


--
-- Data for Name: EmailMessage; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."EmailMessage" (id, "gmailId", "threadId", "applicationId", direction, "fromName", "fromAddress", "toAddress", subject, "messageId", body, "sentAt", kind, summary, questions, "suggestedStatus", "confirmedAt", "classifiedWith", "replyDraft", "replyGaps", "draftedWith", "handledAt", "dismissedAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: Experience; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Experience" (id, role, company, location, "startYear", "startMonth", "endYear", "endMonth", current, bullets, sort, "createdAt", "updatedAt", descriptor) FROM stdin;
exp_jio	Lead Backend Developer	Jio Platforms		2021	9	2024	3	f	Led a team of 4 backend developers responsible for Node.js and JavaScript microservices supporting JioMeet and JioEvents.\nArchitected scalable systems integrating Node.js, Kafka, Redis, WebRTC, WebSocket, MongoDB, PostgreSQL, and RabbitMQ.\nDesigned event-driven architectures processing 900K+ events per hour using Kafka consumer groups and partitioning.\nOptimized Redis caching and database access patterns, reducing database queries by approximately 70%.\nDiagnosed and resolved production issues, including memory leaks, slow queries, latency, and backend bottlenecks.\nImplemented background job processing with Node.js and RabbitMQ.\nImproved security through MFA, OAuth 2.0, centralized logging, and OpenTelemetry.\nImproved code quality by approximately 60% through CI/CD and SonarQube.\nReduced production defects by approximately 50% through TDD.	2	2026-11-03 16:25:33.153	2026-11-03 16:25:33.153	
exp_mpi	Software Development Engineer	Mobile Programming India Pvt. Ltd.		2020	9	2021	8	f	Developed scalable Node.js backend microservices.\nImplemented Redis caching that reduced database queries by approximately 50%.\nParticipated across the software development lifecycle.\nOptimized MySQL access patterns.\nEstablished CI/CD pipelines and conducted code reviews.\nContributed to JioMeet real-time communication features using Node.js, WebRTC, and messaging systems.	3	2026-11-03 16:25:33.153	2026-11-03 16:25:33.153	Client: Jio
exp_hakizimana	Software Development Engineer	Hakizimana Technologies Pvt. Ltd.		2017	7	2020	8	f	Developed RESTful APIs and microservices using Node.js, Express.js, and MySQL.\nImplemented Redis caching to improve response times by approximately 50%.\nOptimized database schemas and queries.\nContributed to ERP modules covering academics, finance, HR, and administration.	4	2026-11-03 16:25:33.153	2026-11-03 16:25:33.153	
exp_freelance	Senior Backend Consultant	Freelance		2025	3	\N	\N	t	Designed and developed scalable backend services using Node.js, JavaScript, TypeScript, Kafka, RabbitMQ, Redis, MongoDB, PostgreSQL, and Elasticsearch.\nArchitected event-driven microservices for real-time and high-throughput applications, emphasizing reliability, scalability, and operational simplicity.\nOptimized MongoDB, PostgreSQL, and MySQL queries through indexing, query tuning, schema optimization, and caching, reducing response times by up to 50%.\nImplemented Elasticsearch-based search solutions.\nSupported production troubleshooting, performance optimization, code reviews, and mentoring.\nDeveloping production-oriented Generative AI capabilities across LLM integration, RAG, vector search, AI agents, tool calling, MCP, evaluation, and AI observability.	0	2026-11-03 16:25:33.153	2026-11-03 16:45:39.928	
exp_newstreet	Technical Leader	New Street Tech		2024	6	2025	2	f	Led and mentored a team of 11 backend developers across Node.js, JavaScript, Go, MongoDB, and PostgreSQL.\nArchitected scalable microservices using Node.js, Kafka, RabbitMQ, Redis, and PostgreSQL for financial and transaction-processing workloads, including real-time payment-status tracking.\nRedesigned core microservices into plug-and-play components, simplifying bank onboarding and reducing manual integration effort.\nBuilt a SaaS insurance SDK and Administration Management System using Node.js, PostgreSQL, OAuth 2.0, MFA, and 2FA.\nIntegrated 5+ payment gateways, improving response times by approximately 40%.\nMigrated services to AWS Lambda.\nEstablished CI/CD pipelines with Mocha, Chai, TDD, ELK Stack, and Elastic APM.	1	2026-11-03 16:25:33.153	2026-11-03 16:45:39.933	FinTech
\.


--
-- Data for Name: ExperienceSkill; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ExperienceSkill" ("experienceId", "skillId") FROM stdin;
\.


--
-- Data for Name: Fact; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Fact" (id, "applicationId", text, sort, "createdAt", "updatedAt") FROM stdin;
cmw0wk1ba000001rkmj3e2zrn	\N	I am a backend engineer with a strong foundation in Node.js, TypeScript, distributed systems, microservices, and event-driven architectures. My experience spans fintech, real-time communication platforms, enterprise applications, and high-throughput backend systems.\n\nI enjoy solving complex engineering problems, designing scalable systems, improving performance, and building reliable production services. I have experience leading backend teams, mentoring developers, making architectural decisions, and collaborating across engineering teams.\n\nI am particularly interested in opportunities where I can combine my backend engineering expertise with modern AI technologies. I am actively expanding my skills in Generative AI, LLM integration, RAG, AI agents, tool calling, and Python-based AI backend development.\n\nMy long-term career direction is to become an AI Backend Engineer, building production-grade AI applications and intelligent backend systems. I am interested in challenging engineerin	0	2026-11-03 16:28:47.398	2026-11-03 16:28:48.664
\.


--
-- Data for Name: GoogleAccount; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."GoogleAccount" (id, email, "refreshTokenEnc", scopes, "historyId", "lastSyncAt", "syncProblem", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Job; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Job" (id, type, key, status, step, input, result, error, "createdAt", "startedAt", "finishedAt", "updatedAt", "applicationId") FROM stdin;
\.


--
-- Data for Name: Language; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Language" (id, name, level, sort, "createdAt") FROM stdin;
lang_english	English	C2	0	2026-11-03 16:25:33.147
\.


--
-- Data for Name: LoginThrottle; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."LoginThrottle" (key, failures, "windowStart", "blockedUntil", "updatedAt") FROM stdin;
*	1	2026-11-17 04:36:59.249	\N	2026-11-17 04:36:59.249
\.


--
-- Data for Name: Note; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Note" (id, "applicationId", body, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Posting; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Posting" (id, source, "externalId", title, company, place, remote, salary, "postedAt", url, via, description, complete, "savedAt", "dismissedAt", "applicationId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: PostingScore; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."PostingScore" (source, "externalId", score, reasons, "redFlags", "scoredWith", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: PostingSearch; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."PostingSearch" (id, source, query, postings, found, next, "createdAt", "updatedAt") FROM stdin;
cmw0wt0q8000101rkjihs27t1	JSEARCH	{"place": "Karnataka", "country": "in", "keywords": "Senior Backend Consultant", "radiusKm": 25, "remoteOnly": true, "postedWithin": "any"}	[{"url": "https://www.sapcommercejobs.com/jobs/sap-commerce-backend-consultant-knack-systems", "via": "SAP Commerce Jobs", "place": "Anywhere", "title": "SAP Commerce Backend Consultant (Developer)", "remote": true, "salary": "", "source": "JSEARCH", "company": "Knack Systems", "complete": true, "postedAt": null, "externalId": "RmN1d1FtSFNXYTVibngxVEFBQUFBQT09OkVzd0JDb3dCUVVSRVlsZGxXVGxUVFMxM2MzZE9PQzFuU1ZCTWNXNURlamQ0YUdNNFlURjZTbGRxT1VKZlRHWk5iamQ1VlhGM2VrOWtia0pITkRWeGVVcEpjSEJTU25aWVIyWnROWEUwVG5SUlFWVk9NMk5QY0dKaU16Tk9aamxsVHpNMFYwczRhMFpsWWt4UFJrTlJTV3cxZHpocGJHaDBkMDFHU2pJelVsVTFjbkJ1V25WQ1lWRnJhbmhyVTIxSlFrMFNGMWxCTTNGaGRVTTVTVnBEYjJoMlkxQndkREk1YVZGSkdpSkJTRTR3UlRkSE1IQTVWMEppT1VsSFZIRmtNVEpJV1MweFlsSlpXRTF3ZDJsMw", "description": "We are looking for an SAP Commerce Backend Consultant (Developer) to join our team. This role is available as Full-time, Contract, or Freelance engagement.\\r\\n\\r\\nThe ideal candidate will develop and maintain backend components within the SAP Commerce Cloud framework, focusing on B2C or B2B accelerators. You will collaborate with cross-functional teams to understand functional requirements and implement scalable backend solutions.\\r\\n\\r\\nThis is a remote position open to candidates globally.\\nResponsibilities\\n• Develop and maintain backend components within the SAP Commerce Cloud framework, focusing on B2C or B2B accelerators\\n• Collaborate with cross-functional teams to understand functional requirements and implement scalable backend solutions\\n• Develop and integrate APIs using OCC (Omni Commerce Connect) and REST/SOAP web services\\n• Implement features using Java, Spring, and J2EE technologies within the Hybris architecture\\n• Participate in code reviews, unit testing, debugging, and performance optimization\\n• Support CI/CD processes using tools like Maven, Ant, and Jenkins\\n• Work with version control systems such as Git\\n• Assist with environment setups and basic deployment tasks using Tomcat and Apache\\n• Collaborate in agile sprints and contribute to team delivery in a global delivery model\\nRequirements\\n• Bachelor's degree in Computer Science, Information Technology, or related field\\n• 3 to 6 years of software development experience\\n• Minimum 2+ years of hands-on experience in SAP Commerce Cloud (Hybris) development\\n• Proficiency in Java, Spring framework, and J2EE technologies\\n• Experience with SAP Commerce modules like Backoffice, WCMS, Product Cockpit, and Promotions\\n• Hands-on experience consuming and building REST/SOAP APIs\\n• Working knowledge of Git, Maven/Ant, and Jenkins\\n• Strong analytical, debugging, and communication skills\\n• Experience working in agile teams and offshore-onsite delivery models\\nNice to have\\n• Experience with SAP Commerce 6.x\\n• CCv2 experience\\n• Headless Commerce experience\\n• B2B/B2C accelerators experience\\n• Tomcat / Apache deployments\\n• Relevant SAP certifications\\n• Familiarity with integration patterns such as JMS, ESB, or SOA"}, {"url": "https://in.linkedin.com/jobs/view/node-js-developer-remote-at-yo-it-consulting-4438973191", "via": "LinkedIn", "place": "Anywhere", "title": "Node.Js Developer - Remote", "remote": true, "salary": "", "source": "JSEARCH", "company": "YO IT Consulting", "complete": true, "postedAt": null, "externalId": "OGxHY21SWmNqbUM4dHZvWEFBQUFBQT09OkVzd0JDb3dCUVVSRVlsZGxZbVpzVDBaeFUwVlliMnh3YVZkZmNIZExhelJEZUhOd1gxbzJjRFEwV0RScVVVa3RSblJITkcxTlFubzRRbXR3UkRZME0ybGpTRWxEUTNWalRXUmtXVU41VWxGUk1XUldjRUp3WVdOdmFFaHJVMHB1Y1hSV1owRlhVSFpHYm1WSmFEUXRkVFZXUzNoaGMxVm5Ra3BaYW5CWllYVlZSMEV0ZVU5MFZtTXdXQzFaTUdoTmVpMFNGMWxCTTNGaGRVTTVTVnBEYjJoMlkxQndkREk1YVZGSkdpSkJTRTR3UlRkSVIyUjNaVXBzWVhVelVYVkhjVnBKWWxCWVptVnBkRWR1TlRsMw", "description": "Job Description\\n\\nJob Title: Node.Js Developer\\n\\nJob Type: Contract\\n\\nLocation: Remote\\n\\nJob Summary: In this role, you'll apply your expertise to help train next-generation AI systems. Your work will shape how models learn, reason, and perform through high-quality, real-world input. No prior experience in AI is required — your domain knowledge is what matters.\\n\\nKey Responsibilities\\n\\n• Leverage your deep knowledge of Node.js, JavaScript, and TypeScript to provide expert-level input and feedback for AI system development.\\n• Analyze and review code samples to ensure accuracy, efficiency, and adherence to best practices.\\n• Collaborate with multidisciplinary teams to identify key development patterns and problem-solving strategies in backend engineering.\\n• Evaluate real-world Node.js scenarios to help models learn robust, scalable, and maintainable solutions.\\n• Document insights, edge cases, and nuanced technical considerations in clear, effective written form.\\n• Contribute to model training by communicating complex concepts in a way that's accessible for both technical and non-technical stakeholders.\\n• Uphold high standards of written and verbal communication with both internal and external partners.\\n\\nRequired Skills And Qualifications\\n\\n• Extensive hands-on experience with Node.js, JavaScript, and TypeScript in professional environments.\\n• Expert problem-solving and debugging abilities within distributed application systems.\\n• Strong attention to detail in both code review and written documentation.\\n• Excellent written and verbal communication skills, with an emphasis on clarity and thoroughness.\\n• Deep understanding of backend application architectures and common development patterns.\\n• Demonstrated ability to analyze and articulate technical trade-offs and solutions.\\n• Proactive, collaborative approach to cross-functional teamwork.\\n\\nPreferred Qualifications\\n\\n• Prior experience contributing to AI-related projects or model training initiatives.\\n• Background in designing or maintaining large-scale, high-availability Node.js applications.\\n• Experience with remote collaboration and asynchronous communication tools."}]	2	\N	2026-11-03 16:35:46.544	2026-11-03 16:35:46.544
\.


--
-- Data for Name: ProfileField; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ProfileField" (key, value, "updatedAt") FROM stdin;
name	Mansoor Khan M	2026-11-03 17:02:55.51
headline	Senior Backend Engineer | Distributed Systems | GenAI / AI Backend Engineering	2026-11-03 17:02:55.511
email	mansoordbit@gmail.com	2026-11-03 17:02:55.511
phone	+91 9606662052	2026-11-03 17:02:55.512
dob	1996-12-29	2026-11-03 17:02:55.512
city	Karnataka	2026-11-03 17:02:55.513
country	India	2026-11-03 17:02:55.513
summary	Senior Backend & AI Engineer with 9+ years of experience designing, scaling, and operating distributed systems, event-driven architectures, and real-time communication platforms. Deep expertise in Node.js, TypeScript, Go, Python (FastAPI), Kafka, and cloud-native infrastructure. Proven track record in bridging core systems engineering with production Generative AI-architecting RAG pipelines, agentic workflows (MCP), vector search, and streaming LLM integrations built for high performance, reliability, and cost efficiency.	2026-11-03 17:02:55.513
\.


--
-- Data for Name: Project; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Project" (id, name, link, "startYear", "startMonth", "endYear", "endMonth", current, bullets, sort, "createdAt", "updatedAt") FROM stdin;
proj_erp	Enterprise ERP Platform		\N	\N	\N	\N	f	Developed backend services supporting multi-module enterprise resource planning workflows, including academics, finance, HR, and administration.	0	2026-11-03 16:27:53.664	2026-11-03 16:27:53.664
proj_jiomeet	JioMeet — Real-Time Video Conferencing		\N	\N	\N	\N	f	Developed and maintained scalable backend microservices supporting real-time video conferencing and communication workflows.	1	2026-11-03 16:27:53.664	2026-11-03 16:27:53.664
proj_jioevents	JioEvents — Event Management Platform		\N	\N	\N	\N	f	Contributed to event management and live-streaming services.	2	2026-11-03 16:27:53.664	2026-11-03 16:27:53.664
proj_cpaas	CPaaS — Communication Platform		\N	\N	\N	\N	f	Developed low-latency communication services using search, caching, and scalable backend architectures.	3	2026-11-03 16:27:53.664	2026-11-03 16:27:53.664
\.


--
-- Data for Name: ProjectSkill; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ProjectSkill" ("projectId", "skillId") FROM stdin;
proj_erp	sk_nodejs
proj_erp	sk_go
proj_erp	sk_grpc
proj_erp	sk_postgres
proj_erp	sk_microservices
proj_jiomeet	sk_nodejs
proj_jiomeet	sk_kafka
proj_jiomeet	sk_redis
proj_jiomeet	sk_webrtc
proj_jiomeet	sk_websocket
proj_jioevents	sk_nodejs
proj_jioevents	sk_kafka
proj_jioevents	sk_redis
proj_jioevents	sk_mongo
proj_jioevents	sk_postgres
proj_cpaas	sk_nodejs
proj_cpaas	sk_es
proj_cpaas	sk_redis
proj_cpaas	sk_distsys
\.


--
-- Data for Name: Publication; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Publication" (id, citation, link, "onResumes", sort, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Reference; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Reference" (id, name, relation, company, email, phone, sort, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Setting; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Setting" (key, value, "updatedAt") FROM stdin;
usagePingChoice	off	2026-11-03 16:18:59.437
usagePingChoiceAt	2026-11-03T16:18:59.436Z	2026-11-03 16:18:59.439
usagePingChoiceText	1	2026-11-03 16:18:59.44
browserTimeZone	Asia/Calcutta	2026-11-03 16:18:59.491
baseThemeId	cmw0ylxew000d01rkq6sp207c	2026-11-03 18:09:22.224
startupsViewedAt	2026-11-03T18:10:28.486Z	2026-11-03 18:10:28.489
updateCheckDay	2026-11-17	2026-11-17 04:39:06.201
jobSource	JSEARCH	2026-11-03 16:30:19.074
latestVersion	1.14.0	2026-11-17 04:39:07.922
latestVersionUrl	https://github.com/AienTech/dossier/releases/tag/v1.14.0	2026-11-17 04:39:07.925
jsearchHost	openwebninja	2026-11-03 16:32:54.071
jsearchKeyEnc	v1.HwtO6F0JZuLRlHh6.MeEh9qaLMMABXVmjRt00bAjSspbs03i6e-BCWKhAz3hE5b8XhNKO_7F3oJxqEHzr2It_2sPWEG2RT9cJaA6rNSbR	2026-11-03 16:35:18.599
provider	LOCAL	2026-11-03 16:50:18.099
baseUrl	http://localhost:11434	2026-11-03 16:50:18.1
\.


--
-- Data for Name: Skill; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Skill" (id, name, sort, "createdAt", "group") FROM stdin;
sk_nodejs	Node.js	0	2026-11-03 16:25:33.154	Backend Development
sk_ts	TypeScript	1	2026-11-03 16:25:33.154	Backend Development
sk_js	JavaScript	2	2026-11-03 16:25:33.154	Backend Development
sk_express	Express.js	3	2026-11-03 16:25:33.154	Backend Development
sk_go	Go	4	2026-11-03 16:25:33.154	Backend Development
sk_rest	REST APIs	5	2026-11-03 16:25:33.154	Backend Development
sk_graphql	GraphQL	6	2026-11-03 16:25:33.154	Backend Development
sk_grpc	gRPC	7	2026-11-03 16:25:33.154	Backend Development
sk_microservices	Microservices	8	2026-11-03 16:25:33.154	Backend Development
sk_distsys	Distributed Systems	9	2026-11-03 16:25:33.154	Backend Development
sk_eda	Event-Driven Architecture	10	2026-11-03 16:25:33.154	Backend Development
sk_sysdesign	System Design	11	2026-11-03 16:25:33.154	Backend Development
sk_postgres	PostgreSQL	12	2026-11-03 16:25:33.154	Databases and Messaging
sk_mongo	MongoDB	13	2026-11-03 16:25:33.154	Databases and Messaging
sk_mysql	MySQL	14	2026-11-03 16:25:33.154	Databases and Messaging
sk_es	Elasticsearch	15	2026-11-03 16:25:33.154	Databases and Messaging
sk_redis	Redis	16	2026-11-03 16:25:33.154	Databases and Messaging
sk_memcached	Memcached	17	2026-11-03 16:25:33.154	Databases and Messaging
sk_kafka	Kafka	18	2026-11-03 16:25:33.154	Databases and Messaging
sk_rabbitmq	RabbitMQ	19	2026-11-03 16:25:33.154	Databases and Messaging
sk_aws	AWS	20	2026-11-03 16:25:33.154	Cloud and Platform Engineering
sk_lambda	AWS Lambda	21	2026-11-03 16:25:33.154	Cloud and Platform Engineering
sk_s3	Amazon S3	22	2026-11-03 16:25:33.154	Cloud and Platform Engineering
sk_docker	Docker	23	2026-11-03 16:25:33.154	Cloud and Platform Engineering
sk_k8s	Kubernetes	24	2026-11-03 16:25:33.154	Cloud and Platform Engineering
sk_jenkins	Jenkins	25	2026-11-03 16:25:33.154	Cloud and Platform Engineering
sk_azdo	Azure DevOps	26	2026-11-03 16:25:33.154	Cloud and Platform Engineering
sk_cicd	CI/CD	27	2026-11-03 16:25:33.154	Cloud and Platform Engineering
sk_prometheus	Prometheus	28	2026-11-03 16:25:33.154	Observability and Monitoring
sk_grafana	Grafana	29	2026-11-03 16:25:33.154	Observability and Monitoring
sk_elk	ELK Stack	30	2026-11-03 16:25:33.154	Observability and Monitoring
sk_newrelic	New Relic	31	2026-11-03 16:25:33.154	Observability and Monitoring
sk_datadog	Datadog	32	2026-11-03 16:25:33.154	Observability and Monitoring
sk_apm	Elastic APM	33	2026-11-03 16:25:33.154	Observability and Monitoring
sk_otel	OpenTelemetry	34	2026-11-03 16:25:33.154	Observability and Monitoring
sk_webrtc	WebRTC	35	2026-11-03 16:25:33.154	Real-Time Communication
sk_websocket	WebSocket	36	2026-11-03 16:25:33.154	Real-Time Communication
sk_janus	Janus	37	2026-11-03 16:25:33.154	Real-Time Communication
sk_mediasoup	MediaSoup	38	2026-11-03 16:25:33.154	Real-Time Communication
sk_oauth	OAuth 2.0	39	2026-11-03 16:25:33.154	Security
sk_jwt	JWT	40	2026-11-03 16:25:33.154	Security
sk_mfa	MFA/2FA	41	2026-11-03 16:25:33.154	Security
sk_owasp	OWASP Top 10	42	2026-11-03 16:25:33.154	Security
sk_llm	LLM APIs	43	2026-11-03 16:25:33.154	AI / Generative AI
sk_prompt	Prompt Engineering	44	2026-11-03 16:25:33.154	AI / Generative AI
sk_rag	RAG	45	2026-11-03 16:25:33.154	AI / Generative AI
sk_embeddings	Embeddings	46	2026-11-03 16:25:33.154	AI / Generative AI
sk_vectorsearch	Vector Search	47	2026-11-03 16:25:33.154	AI / Generative AI
sk_pgvector	pgvector	48	2026-11-03 16:25:33.154	AI / Generative AI
sk_toolcalling	Tool Calling	50	2026-11-03 16:25:33.154	AI / Generative AI
sk_langchain	LangChain	51	2026-11-03 16:25:33.154	AI / Generative AI
sk_langgraph	LangGraph	52	2026-11-03 16:25:33.154	AI / Generative AI
sk_mcp	MCP	53	2026-11-03 16:25:33.154	AI / Generative AI
cmw0xj6bc000201rkyeafhtno	Python	54	2026-11-03 16:56:06.84	Backend Development
cmw0xjvht000301rkhrb4fhwb	FastAPI	55	2026-11-03 16:56:39.473	Backend Development
cmw0xkmqd000401rktsssnybt	AI-Powered Backend Development	56	2026-11-03 16:57:14.773	Backend Development
cmw0xkr9b000501rkxk7ta0c7	LLM API Integration	57	2026-11-03 16:57:20.639	Backend Development
cmw0xkwx1000601rk7sgjdnkd	OpenAI API	58	2026-11-03 16:57:27.973	Backend Development
cmw0xl1gr000701rk5egbvusd	Anthropic Claude API	59	2026-11-03 16:57:33.867	Backend Development
cmw0xl5sg000801rk0gmtborm	AI Integration Using Node.js	60	2026-11-03 16:57:39.472	Backend Development
cmw0xl68x000901rkug7z2kse	AI-Powered REST APIs	61	2026-11-03 16:57:40.065	Backend Development
cmw0xlmsd000a01rkadkbug8o	RAG Integration	62	2026-11-03 16:58:01.501	Backend Development
sk_agents	AI Agents	49	2026-11-03 16:25:33.154	Backend Development
cmw0xlsgt000b01rkl0y9ei4z	MCP Integrations	63	2026-11-03 16:58:08.862	Backend Development
cmw0xlt19000c01rk1mv40vwf	Third-Party Integrations	64	2026-11-03 16:58:09.597	Backend Development
\.


--
-- Data for Name: Startup; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Startup" (id, source, "externalId", company, website, summary, details, location, remote, stage, roles, emails, links, "postedAt", score, reasons, "scoredWith", status, "noApplicationsFrom", "emailsCheckedAt", "peopleCheckedAt", notes, "seenAt", "applicationId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: StartupBlock; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."StartupBlock" (hash, "createdAt") FROM stdin;
\.


--
-- Data for Name: StatusEvent; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."StatusEvent" (id, "applicationId", "from", "to", at, "previousFurthestStage", "previousSentAt") FROM stdin;
\.


--
-- Data for Name: Theme; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Theme" (id, "builtIn", name, "headFont", "bodyFont", accent, layout, align, "headingStyle", density, "createdAt", "updatedAt", "dateStyle", "headerStyle", "sidebarStyle", "photoPosition", "photoShape") FROM stdin;
cmw0ylxew000d01rkq6sp207c	f	single column	NEWSREADER	PLEX_SANS	#1d1c1a	SINGLE	LEFT	RULE	COMPACT	2026-11-03 17:26:14.889	2026-11-03 17:26:54.439	INLINE	PLAIN	PLAIN	HEADER_END	PORTRAIT
editorial	t	Editorial	NEWSREADER	GEIST	#7a3b2e	SINGLE	LEFT	PLAIN	REGULAR	2026-11-03 16:18:27.233	2026-11-17 04:38:42.239	INLINE	PLAIN	PLAIN	HEADER_END	CIRCLE
classic	t	Classic	GARAMOND	GARAMOND	#1d1c1a	SINGLE	CENTER	RULE	REGULAR	2026-11-03 16:18:27.249	2026-11-17 04:38:42.27	INLINE	PLAIN	PLAIN	ABOVE_NAME	CIRCLE
modern	t	Modern	GEIST	GEIST	#2f5d8a	SPLIT	LEFT	CAPS	REGULAR	2026-11-03 16:18:27.252	2026-11-17 04:38:42.275	INLINE	PLAIN	PLAIN	SIDEBAR	ROUNDED
minimal	t	Minimal	PLEX_SANS	PLEX_SANS	#6f6a62	SINGLE	LEFT	CAPS	AIRY	2026-11-03 16:18:27.254	2026-11-17 04:38:42.278	INLINE	PLAIN	PLAIN	HEADER_END	SQUARE
technical	t	Technical	PLEX_MONO	PLEX_SANS	#2d6a4f	SPLIT	LEFT	RULE	COMPACT	2026-11-03 16:18:27.257	2026-11-17 04:38:42.281	INLINE	PLAIN	PLAIN	SIDEBAR	SQUARE
ledger	t	Ledger	NEWSREADER	PLEX_SANS	#1d1c1a	SPLIT	LEFT	RULE	COMPACT	2026-11-03 16:18:27.258	2026-11-17 04:38:42.284	INLINE	PLAIN	PLAIN	HEADER_END	PORTRAIT
signal	t	Signal	MANROPE	MANROPE	#1f3a5f	SINGLE	LEFT	BAR	REGULAR	2026-11-03 16:18:27.262	2026-11-17 04:38:42.29	INLINE	BANNER	PLAIN	HEADER_START	CIRCLE
studio	t	Studio	SPACE_GROTESK	INTER	#1f6f6b	SPLIT_END	LEFT	CAPS	REGULAR	2026-11-03 16:18:27.266	2026-11-17 04:38:42.296	INLINE	PLAIN	TINTED	SIDEBAR	CIRCLE
chronicle	t	Chronicle	FRAUNCES	SOURCE_SERIF	#7b2337	SINGLE	LEFT	RULE	REGULAR	2026-11-03 16:18:27.269	2026-11-17 04:38:42.299	TIMELINE	PLAIN	PLAIN	HEADER_END	PORTRAIT
folio	t	Folio	PLAYFAIR	LORA	#1d1c1a	SIDE_HEADINGS	LEFT	PLAIN	AIRY	2026-11-03 16:18:27.274	2026-11-17 04:38:42.307	INLINE	PLAIN	PLAIN	HEADER_START	ROUNDED
console	t	Console	JETBRAINS_MONO	WORK_SANS	#4a5563	SPLIT	LEFT	BAND	COMPACT	2026-11-03 16:18:27.283	2026-11-17 04:38:42.326	INLINE	PLAIN	TINTED	SIDEBAR	SQUARE
atlas	t	Atlas	LIBRE_CASLON	INTER	#a14a1f	SINGLE	CENTER	CAPS	REGULAR	2026-11-03 16:18:27.286	2026-11-17 04:38:42.329	TIMELINE	BANNER	PLAIN	ABOVE_NAME	CIRCLE
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
56dc8906-b257-4c5b-9340-08a82a1bc695	2bfe4e5eb3bf5dc465052caeda40326bcba983257a8d02bfcd4b88d42afe6da1	2026-11-03 16:18:25.85677+00	20261020075309_projects	\N	\N	2026-11-03 16:18:25.851147+00	1
55329548-f4ee-437f-9f71-317487629373	14f91e5fee34018acd31bb179545a59d1a71ab1730979dfe44b16f4805caaa8d	2026-11-03 16:18:25.712273+00	20260927203329_profile_schema	\N	\N	2026-11-03 16:18:25.647946+00	1
672ada26-8abe-42b6-9e8e-141883ee5d39	9f4a4ae406d938efaf79c928ba1b47c45b5e51b98a919eb5acca98f878b1aec6	2026-11-03 16:18:25.821349+00	20261003140921_theme_styles	\N	\N	2026-11-03 16:18:25.814128+00	1
af11fe14-938d-476a-8b69-73ece361fdc7	dc495d5d2b74a7d2a68ba11e82b527cdfb10551764651dc83e5c572b1fdae30a	2026-11-03 16:18:25.741285+00	20260927204812_theme_settings_schema	\N	\N	2026-11-03 16:18:25.714003+00	1
eb1eb009-a83e-40dd-90e2-57c73f2ed6b4	e865b10099ac3f6814272ed2709201ed56d298f666df4634d242329b022271e6	2026-11-03 16:18:25.774703+00	20260927205135_application_schema	\N	\N	2026-11-03 16:18:25.742174+00	1
879e934a-f68e-4f7a-ae11-8401c428cd0f	f8d9fc48cf8fe2784b5c5f1976f071568328b04e3e746314f4922ee9e56f6c38	2026-11-03 16:18:25.779221+00	20260927220319_login_throttle	\N	\N	2026-11-03 16:18:25.775306+00	1
6ecab4af-17c4-4baa-9009-f85bc9f4d88c	a24ef7c79f2ecba37c5b308e17a79d49fc800f2329617548eaf82ceffca63a33	2026-11-03 16:18:25.827221+00	20261003151312_job_search_postings	\N	\N	2026-11-03 16:18:25.82179+00	1
17bb3a06-ddd2-4b49-ba6b-9b815de320a8	c8a6f159b87bce862cf88fe4b31371516d5baa560ee8a56a7bc06952a1715081	2026-11-03 16:18:25.78322+00	20260928113343_job_table	\N	\N	2026-11-03 16:18:25.779605+00	1
86891b73-7fac-448e-8bbc-775753d50aad	5204707abb19b526fab1479d46582150f3de629d87a213945e2f495dc3d7e6c9	2026-11-03 16:18:25.785248+00	20260928114124_prompt_versions	\N	\N	2026-11-03 16:18:25.783518+00	1
c8ebf376-d6b6-4cb0-8a8f-6b9ccd18381c	608b1f374694c085815802707ed8ac6275f571fc4e8dd53a277be8a7f920173a	2026-11-03 16:18:25.799836+00	20260928124620_key_value_profile_settings	\N	\N	2026-11-03 16:18:25.785574+00	1
3b6f850d-f1aa-47c8-84b5-f076a0b89e7c	e8adff527ce8010364ac7d15d24a81dd41ea5cf8e2703238f61f0f6936ca1b6a	2026-11-03 16:18:25.830301+00	20261003160849_job_search_runs	\N	\N	2026-11-03 16:18:25.827547+00	1
a6269b19-9651-4c3d-831b-658ff82c4d4a	2ad5f7ae9a38c6e8d8a0e65a305f6a904a2d816c8d07af9ad0b7cc964d3a1cdf	2026-11-03 16:18:25.802425+00	20260928142826_application_follow_theme_layout	\N	\N	2026-11-03 16:18:25.800184+00	1
05a8b9dd-079e-40a4-bc93-10de5ac8284c	8aa6e3aac704b236b1d7ea532cac92ee3be0b903ec8787b835fbac80b2528b9f	2026-11-03 16:18:25.804948+00	20260928145118_chat_message_previous_tone	\N	\N	2026-11-03 16:18:25.802764+00	1
0739d421-63db-4d3b-aa9f-fa546199a294	6dc006c2badd26af1c3ee39bc9be80e8ef44728c9807caf273c0354c9dec1325	2026-11-03 16:18:25.864056+00	20261020092056_job_agent	\N	\N	2026-11-03 16:18:25.857075+00	1
ec6d55d3-17ed-444b-a5b7-fe62412312e0	9da3b3079d3caf6fd02c5cb78af042c3b4d4c794224ebbf91a11d606359c8ecf	2026-11-03 16:18:25.807114+00	20260928151329_note_updated_at	\N	\N	2026-11-03 16:18:25.805366+00	1
01c815fc-9cc3-43e0-ba29-9c2843ca3fbb	e0502ceb78c04d4ce1b9a31fc0ecde1cffaa65f5004ef245a165d300d68dc09d	2026-11-03 16:18:25.831953+00	20261014115435_email_document	\N	\N	2026-11-03 16:18:25.830781+00	1
a04cab86-ae1f-4df6-9ed6-d9f33baaec1c	852bd4053b81dc718ad6d419bfc9c723299ace929ed1fb6f6cfa7a426bebc130	2026-11-03 16:18:25.808476+00	20260928173823_document_trimmed	\N	\N	2026-11-03 16:18:25.80741+00	1
2584b44b-7eec-4bef-8acc-bb50fe9b979c	7e55a02c63c8105b242a6abf8e2dd201ee24cbd004529eeccc4da4e4dd153d26	2026-11-03 16:18:25.812146+00	20260929101733_document_versions	\N	\N	2026-11-03 16:18:25.80878+00	1
23906944-03f1-4075-8dbe-555142c90c53	ec93f09fd3fd6670c59fd0adbf81c15f80d32907f00a47e8ef72e3f5ffc1fef8	2026-11-03 16:18:25.813816+00	20260929112848_application_next_interview	\N	\N	2026-11-03 16:18:25.812468+00	1
1649fb57-0166-4eb4-89d7-bf6238f41933	86d87b3152567bf047b7ba4e1dd97274eab05121849447015e8d57969f6d6024	2026-11-03 16:18:25.838558+00	20261018093130_job_application_link	\N	\N	2026-11-03 16:18:25.832251+00	1
e138e4c1-aea0-44f7-962d-dab3d836385e	445d0cdd823b378481e0d602e33f277ce820fb89cbbd7b7e4506476160b5920e	2026-11-03 16:18:25.877288+00	20261022112358_publications	\N	\N	2026-11-03 16:18:25.874742+00	1
e7518fbb-4813-40f2-afb4-06ba0ad0d4c0	e35358334928289facc3c663a239d4a9c3107ac80af52d8a2aef907b60772169	2026-11-03 16:18:25.847259+00	20261018110840_google_integration	\N	\N	2026-11-03 16:18:25.838936+00	1
56a823c5-77aa-4268-afa7-131b63db0bf2	7b09a440fd9e2e96e18020a77e33ab2ea84fb58351e7101c2ee06b2c2b7787b2	2026-11-03 16:18:25.865217+00	20261020100056_ai_provider_mistral	\N	\N	2026-11-03 16:18:25.864332+00	1
c51c2ea3-0d6f-44bc-aee2-632f63b2fac1	82a13a9d947d287522a4da9beb53d143bb81d8eafb1aa0855eaaf26bcd7c9287	2026-11-03 16:18:25.849529+00	20261018192903_email_messages_follow_application	\N	\N	2026-11-03 16:18:25.847551+00	1
ecd42e98-9917-47a4-a401-10176c8b377d	91eac4af60c5549e4943a0bcba53eb9398515ee9d8cbf9fd83b4e5b0fa5fc6c4	2026-11-03 16:18:25.850873+00	20261018222649_interview_calendar_event	\N	\N	2026-11-03 16:18:25.849813+00	1
0b90a671-3a5d-4553-8271-99f750ab9f4e	91de5851efcc27a49804b125e894f4042dd4e799b3a3fcd0a53af8b28c315a38	2026-11-03 16:18:25.895144+00	20261028172234_experience_descriptor	\N	\N	2026-11-03 16:18:25.892545+00	1
4c4e1472-fe3f-4155-aef9-266534107a2f	e97a21899958ce111365d1b3dd9a9917a973b08e152e6775a4b7317d1c32e189	2026-11-03 16:18:25.867482+00	20261020102121_posting_scores	\N	\N	2026-11-03 16:18:25.865451+00	1
2d81b7d6-4979-43ed-85e5-16ce0ed4656e	72c9e19be2529269107f9720c882ab783f4faaf5d6f21a40eaa1d28ac9b16ea1	2026-11-03 16:18:25.880052+00	20261023081943_profile_photo	\N	\N	2026-11-03 16:18:25.877599+00	1
88ab2140-6e33-4b47-8bb7-663c544a285b	e88786e0c5ec2c88ca885163d4add3ea36f8a4d33272b8d83a9a5161f252474f	2026-11-03 16:18:25.86862+00	20261020115546_ai_provider_lmstudio	\N	\N	2026-11-03 16:18:25.867743+00	1
65ebfc4d-b780-45ee-b244-4fb6da0804f7	8f71340b3beff3c8a6f5f6f495a3450c2d9d35dcfbeb2ef726896d13f9f009db	2026-11-03 16:18:25.874397+00	20261022090000_facts	\N	\N	2026-11-03 16:18:25.869093+00	1
d521c7b9-f916-4f17-ab85-6c1fa09ee96e	b38806fa4d8344ccecfb2e70c6af6669e32402e31ef12640487df167b8422b26	2026-11-03 16:18:25.888919+00	20261023084641_startups	\N	\N	2026-11-03 16:18:25.880368+00	1
3fd9c6f0-3d16-414b-afa6-ae3641fbb75c	e2ad7bffca4255ff72493a74e92dd6dd7c706041e2c4aea15323572a04868a01	2026-11-03 16:18:25.900032+00	20261030193609_skill_group	\N	\N	2026-11-03 16:18:25.898142+00	1
92c61a82-ab69-4806-a531-195a44a228a0	a2df80a7f26753fb4947a8413a21921887057609debac74c254f14f29ec421c3	2026-11-03 16:18:25.892116+00	20261023100000_claude_pastes	\N	\N	2026-11-03 16:18:25.889236+00	1
dd5e7acd-addf-48b2-b9f4-5e38746a70fc	11cc69885d07b8c034c1e40dc7a4053d47398b09b20073d648be60c7ca80505c	2026-11-03 16:18:25.897715+00	20261029120000_freehire_source	\N	\N	2026-11-03 16:18:25.895488+00	1
\.


--
-- Name: AgentCandidate AgentCandidate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentCandidate"
    ADD CONSTRAINT "AgentCandidate_pkey" PRIMARY KEY (id);


--
-- Name: Application Application_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Application"
    ADD CONSTRAINT "Application_pkey" PRIMARY KEY (id);


--
-- Name: ChatMessage ChatMessage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatMessage"
    ADD CONSTRAINT "ChatMessage_pkey" PRIMARY KEY (id);


--
-- Name: ClaudePaste ClaudePaste_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClaudePaste"
    ADD CONSTRAINT "ClaudePaste_pkey" PRIMARY KEY (id);


--
-- Name: DocumentVersion DocumentVersion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentVersion"
    ADD CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY (id);


--
-- Name: Document Document_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Document"
    ADD CONSTRAINT "Document_pkey" PRIMARY KEY (id);


--
-- Name: Education Education_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Education"
    ADD CONSTRAINT "Education_pkey" PRIMARY KEY (id);


--
-- Name: EmailMessage EmailMessage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmailMessage"
    ADD CONSTRAINT "EmailMessage_pkey" PRIMARY KEY (id);


--
-- Name: ExperienceSkill ExperienceSkill_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExperienceSkill"
    ADD CONSTRAINT "ExperienceSkill_pkey" PRIMARY KEY ("experienceId", "skillId");


--
-- Name: Experience Experience_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Experience"
    ADD CONSTRAINT "Experience_pkey" PRIMARY KEY (id);


--
-- Name: Fact Fact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Fact"
    ADD CONSTRAINT "Fact_pkey" PRIMARY KEY (id);


--
-- Name: GoogleAccount GoogleAccount_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GoogleAccount"
    ADD CONSTRAINT "GoogleAccount_pkey" PRIMARY KEY (id);


--
-- Name: Job Job_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Job"
    ADD CONSTRAINT "Job_pkey" PRIMARY KEY (id);


--
-- Name: Language Language_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Language"
    ADD CONSTRAINT "Language_pkey" PRIMARY KEY (id);


--
-- Name: LoginThrottle LoginThrottle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LoginThrottle"
    ADD CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY (key);


--
-- Name: Note Note_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Note"
    ADD CONSTRAINT "Note_pkey" PRIMARY KEY (id);


--
-- Name: PostingScore PostingScore_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PostingScore"
    ADD CONSTRAINT "PostingScore_pkey" PRIMARY KEY (source, "externalId");


--
-- Name: PostingSearch PostingSearch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PostingSearch"
    ADD CONSTRAINT "PostingSearch_pkey" PRIMARY KEY (id);


--
-- Name: Posting Posting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Posting"
    ADD CONSTRAINT "Posting_pkey" PRIMARY KEY (id);


--
-- Name: ProfileField ProfileField_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProfileField"
    ADD CONSTRAINT "ProfileField_pkey" PRIMARY KEY (key);


--
-- Name: ProjectSkill ProjectSkill_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProjectSkill"
    ADD CONSTRAINT "ProjectSkill_pkey" PRIMARY KEY ("projectId", "skillId");


--
-- Name: Project Project_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Project"
    ADD CONSTRAINT "Project_pkey" PRIMARY KEY (id);


--
-- Name: Publication Publication_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Publication"
    ADD CONSTRAINT "Publication_pkey" PRIMARY KEY (id);


--
-- Name: Reference Reference_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Reference"
    ADD CONSTRAINT "Reference_pkey" PRIMARY KEY (id);


--
-- Name: Setting Setting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Setting"
    ADD CONSTRAINT "Setting_pkey" PRIMARY KEY (key);


--
-- Name: Skill Skill_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Skill"
    ADD CONSTRAINT "Skill_pkey" PRIMARY KEY (id);


--
-- Name: StartupBlock StartupBlock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StartupBlock"
    ADD CONSTRAINT "StartupBlock_pkey" PRIMARY KEY (hash);


--
-- Name: Startup Startup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Startup"
    ADD CONSTRAINT "Startup_pkey" PRIMARY KEY (id);


--
-- Name: StatusEvent StatusEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StatusEvent"
    ADD CONSTRAINT "StatusEvent_pkey" PRIMARY KEY (id);


--
-- Name: Theme Theme_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Theme"
    ADD CONSTRAINT "Theme_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: AgentCandidate_applicationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AgentCandidate_applicationId_key" ON public."AgentCandidate" USING btree ("applicationId");


--
-- Name: AgentCandidate_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AgentCandidate_createdAt_idx" ON public."AgentCandidate" USING btree ("createdAt");


--
-- Name: AgentCandidate_dedupeKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AgentCandidate_dedupeKey_key" ON public."AgentCandidate" USING btree ("dedupeKey");


--
-- Name: AgentCandidate_source_externalId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AgentCandidate_source_externalId_key" ON public."AgentCandidate" USING btree (source, "externalId");


--
-- Name: AgentCandidate_status_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AgentCandidate_status_score_idx" ON public."AgentCandidate" USING btree (status, score);


--
-- Name: Application_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Application_status_idx" ON public."Application" USING btree (status);


--
-- Name: Application_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Application_updatedAt_idx" ON public."Application" USING btree ("updatedAt");


--
-- Name: ChatMessage_applicationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatMessage_applicationId_createdAt_idx" ON public."ChatMessage" USING btree ("applicationId", "createdAt");


--
-- Name: ClaudePaste_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ClaudePaste_expiresAt_idx" ON public."ClaudePaste" USING btree ("expiresAt");


--
-- Name: DocumentVersion_documentId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DocumentVersion_documentId_createdAt_idx" ON public."DocumentVersion" USING btree ("documentId", "createdAt");


--
-- Name: Document_applicationId_kind_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Document_applicationId_kind_key" ON public."Document" USING btree ("applicationId", kind);


--
-- Name: EmailMessage_applicationId_sentAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EmailMessage_applicationId_sentAt_idx" ON public."EmailMessage" USING btree ("applicationId", "sentAt");


--
-- Name: EmailMessage_gmailId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EmailMessage_gmailId_key" ON public."EmailMessage" USING btree ("gmailId");


--
-- Name: EmailMessage_sentAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EmailMessage_sentAt_idx" ON public."EmailMessage" USING btree ("sentAt");


--
-- Name: EmailMessage_threadId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EmailMessage_threadId_idx" ON public."EmailMessage" USING btree ("threadId");


--
-- Name: ExperienceSkill_skillId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ExperienceSkill_skillId_idx" ON public."ExperienceSkill" USING btree ("skillId");


--
-- Name: Fact_applicationId_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Fact_applicationId_sort_idx" ON public."Fact" USING btree ("applicationId", sort);


--
-- Name: Job_applicationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Job_applicationId_idx" ON public."Job" USING btree ("applicationId");


--
-- Name: Job_key_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Job_key_createdAt_idx" ON public."Job" USING btree (key, "createdAt");


--
-- Name: Job_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Job_status_idx" ON public."Job" USING btree (status);


--
-- Name: Language_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Language_name_key" ON public."Language" USING btree (name);


--
-- Name: LoginThrottle_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LoginThrottle_updatedAt_idx" ON public."LoginThrottle" USING btree ("updatedAt");


--
-- Name: Note_applicationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Note_applicationId_createdAt_idx" ON public."Note" USING btree ("applicationId", "createdAt");


--
-- Name: PostingSearch_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PostingSearch_createdAt_idx" ON public."PostingSearch" USING btree ("createdAt");


--
-- Name: Posting_applicationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Posting_applicationId_key" ON public."Posting" USING btree ("applicationId");


--
-- Name: Posting_dismissedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Posting_dismissedAt_idx" ON public."Posting" USING btree ("dismissedAt");


--
-- Name: Posting_savedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Posting_savedAt_idx" ON public."Posting" USING btree ("savedAt");


--
-- Name: Posting_source_externalId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Posting_source_externalId_key" ON public."Posting" USING btree (source, "externalId");


--
-- Name: ProjectSkill_skillId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProjectSkill_skillId_idx" ON public."ProjectSkill" USING btree ("skillId");


--
-- Name: Skill_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Skill_name_key" ON public."Skill" USING btree (name);


--
-- Name: Startup_applicationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Startup_applicationId_key" ON public."Startup" USING btree ("applicationId");


--
-- Name: Startup_source_externalId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Startup_source_externalId_key" ON public."Startup" USING btree (source, "externalId");


--
-- Name: Startup_status_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Startup_status_score_idx" ON public."Startup" USING btree (status, score);


--
-- Name: StatusEvent_applicationId_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StatusEvent_applicationId_at_idx" ON public."StatusEvent" USING btree ("applicationId", at);


--
-- Name: Theme Theme_prevent_builtin_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Theme_prevent_builtin_delete" BEFORE DELETE ON public."Theme" FOR EACH ROW EXECUTE FUNCTION public.prevent_builtin_theme_delete();


--
-- Name: AgentCandidate AgentCandidate_applicationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentCandidate"
    ADD CONSTRAINT "AgentCandidate_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES public."Application"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ChatMessage ChatMessage_applicationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatMessage"
    ADD CONSTRAINT "ChatMessage_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES public."Application"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DocumentVersion DocumentVersion_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentVersion"
    ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public."Document"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Document Document_applicationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Document"
    ADD CONSTRAINT "Document_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES public."Application"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Document Document_themeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Document"
    ADD CONSTRAINT "Document_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES public."Theme"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: EmailMessage EmailMessage_applicationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmailMessage"
    ADD CONSTRAINT "EmailMessage_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES public."Application"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ExperienceSkill ExperienceSkill_experienceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExperienceSkill"
    ADD CONSTRAINT "ExperienceSkill_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES public."Experience"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ExperienceSkill ExperienceSkill_skillId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExperienceSkill"
    ADD CONSTRAINT "ExperienceSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES public."Skill"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Fact Fact_applicationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Fact"
    ADD CONSTRAINT "Fact_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES public."Application"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Job Job_applicationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Job"
    ADD CONSTRAINT "Job_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES public."Application"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Note Note_applicationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Note"
    ADD CONSTRAINT "Note_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES public."Application"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Posting Posting_applicationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Posting"
    ADD CONSTRAINT "Posting_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES public."Application"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ProjectSkill ProjectSkill_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProjectSkill"
    ADD CONSTRAINT "ProjectSkill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public."Project"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ProjectSkill ProjectSkill_skillId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProjectSkill"
    ADD CONSTRAINT "ProjectSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES public."Skill"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Startup Startup_applicationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Startup"
    ADD CONSTRAINT "Startup_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES public."Application"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: StatusEvent StatusEvent_applicationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StatusEvent"
    ADD CONSTRAINT "StatusEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES public."Application"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict b08LOl7BQ7ISLasu0oY0ngd9aZOoTfTllnOckacGhFOC6BrNHzi4HsBkQ1t2Dqb

