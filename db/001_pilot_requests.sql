CREATE TABLE IF NOT EXISTS pilot_requests (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  company text NOT NULL CHECK (char_length(company) BETWEEN 1 AND 120),
  workflow text NOT NULL CHECK (workflow IN ('intake', 'servicing', 'reporting', 'integration')),
  context text NOT NULL CHECK (char_length(context) <= 600),
  created_at timestamptz NOT NULL DEFAULT now()
);
