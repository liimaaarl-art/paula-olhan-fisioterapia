CREATE TABLE IF NOT EXISTS public.olhan_patient_accounts (
 patient_id text PRIMARY KEY, cpf_key text NOT NULL UNIQUE, active boolean NOT NULL DEFAULT true,
 password_hash text, epoch integer NOT NULL DEFAULT 0,
 invite_hash text UNIQUE, invite_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.olhan_patient_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.olhan_patient_accounts FROM PUBLIC;
CREATE TABLE IF NOT EXISTS public.olhan_patient_sessions (
 token_hash text PRIMARY KEY, patient_id text NOT NULL REFERENCES public.olhan_patient_accounts(patient_id),
 epoch integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS olhan_patient_sessions_expiry ON public.olhan_patient_sessions(expires_at);
ALTER TABLE public.olhan_patient_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.olhan_patient_sessions FROM PUBLIC;
CREATE TABLE IF NOT EXISTS public.olhan_patient_rates (
 key text PRIMARY KEY, hits integer NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL
);
ALTER TABLE public.olhan_patient_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.olhan_patient_rates FROM PUBLIC;
CREATE TABLE IF NOT EXISTS public.olhan_cloud_files_large (
 id uuid PRIMARY KEY, patient_id text NOT NULL, object_key text NOT NULL UNIQUE,
 name text NOT NULL, mime text NOT NULL, size integer NOT NULL CHECK(size>0 AND size<=104857600),
 uploaded_by text NOT NULL, ready boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS olhan_cloud_files_large_patient ON public.olhan_cloud_files_large(patient_id);
ALTER TABLE public.olhan_cloud_files_large ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.olhan_cloud_files_large FROM PUBLIC;
ALTER TABLE public.olhan_cloud_files_large ADD COLUMN IF NOT EXISTS upload_id text;
ALTER TABLE public.olhan_cloud_files_large ADD COLUMN IF NOT EXISTS parts jsonb NOT NULL DEFAULT '{}'::jsonb;
