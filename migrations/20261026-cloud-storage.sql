CREATE TABLE IF NOT EXISTS public.olhan_workspace (
 id text PRIMARY KEY CHECK (id='olhan'),
 revision integer NOT NULL DEFAULT 1,
 data jsonb NOT NULL CHECK (jsonb_typeof(data)='object'),
 updated_by text NOT NULL REFERENCES public.olhan_auth_user(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.olhan_workspace ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.olhan_workspace FROM PUBLIC;
CREATE TABLE IF NOT EXISTS public.olhan_workspace_history (
 revision integer PRIMARY KEY,
 data jsonb NOT NULL,
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.olhan_workspace_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.olhan_workspace_history FROM PUBLIC;
CREATE TABLE IF NOT EXISTS public.olhan_cloud_files (
 id uuid PRIMARY KEY,
 patient_id text NOT NULL,
 object_key text NOT NULL UNIQUE,
 name text NOT NULL,
 mime text NOT NULL,
 size integer NOT NULL CHECK (size>0 AND size<=3145728),
 uploaded_by text NOT NULL REFERENCES public.olhan_auth_user(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS olhan_cloud_files_patient_idx ON public.olhan_cloud_files(patient_id);
ALTER TABLE public.olhan_cloud_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.olhan_cloud_files FROM PUBLIC;
