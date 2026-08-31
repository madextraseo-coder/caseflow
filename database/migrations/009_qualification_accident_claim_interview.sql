-- CASEFLOW v0.8: versioned 21-question accident/claim interview for every qualification.
-- Detailed answers may include insurance and medical information, so they are stored encrypted.

CREATE TABLE IF NOT EXISTS qualification_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  template_code text NOT NULL,
  template_version text NOT NULL,
  question_count integer NOT NULL CHECK (question_count > 0),
  answers_ciphertext text NOT NULL,
  completed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qualification_interviews_matter_idx
  ON qualification_interviews(matter_id, completed_at DESC);

DROP TRIGGER IF EXISTS trg_qualification_interviews_immutable ON qualification_interviews;
CREATE TRIGGER trg_qualification_interviews_immutable
BEFORE UPDATE OR DELETE ON qualification_interviews
FOR EACH ROW EXECUTE FUNCTION immutable_event_table();
