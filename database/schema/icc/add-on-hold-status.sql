-- MIGRATION: add on_hold status + allow admin/supervisor free status moves
-- Run ONCE in Supabase → SQL Editor (safe to re-run).
--
-- Changes:
--   1. Adds 'on_hold' to the intern_tasks.status CHECK constraint
--   2. Rewrites enforce_task_rules so admins/supervisors can freely move
--      tasks between any non-reviewed status (hold, resume, move backwards)
--   3. Interns retain the strict forward-only flow on their own tasks

-- 1. Update the status CHECK constraint
ALTER TABLE intern_tasks DROP CONSTRAINT IF EXISTS intern_tasks_status_check;
ALTER TABLE intern_tasks ADD CONSTRAINT intern_tasks_status_check
  CHECK (status IN ('assigned', 'acknowledged', 'in_progress', 'on_hold', 'completed', 'reviewed'));

-- 2. Rewrite enforce_task_rules
CREATE OR REPLACE FUNCTION public.enforce_task_rules()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor      uuid := auth.uid();
  actor_role text;
BEGIN
  IF actor IS NOT NULL THEN
    actor_role := public.current_user_role();
  END IF;

  -- INSERT: only admins, must start as 'assigned'
  IF tg_op = 'INSERT' THEN
    IF actor IS NOT NULL THEN
      IF actor_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Only admins can create tasks.';
      END IF;
      IF new.status <> 'assigned' THEN
        RAISE EXCEPTION 'New tasks must start as assigned.';
      END IF;
    END IF;
    RETURN new;
  END IF;

  -- DELETE: reviewed tasks locked; only admins
  IF tg_op = 'DELETE' THEN
    IF old.status = 'reviewed' THEN
      RAISE EXCEPTION 'Reviewed tasks are locked and cannot be deleted.';
    END IF;
    IF actor IS NOT NULL AND actor_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only admins can delete tasks.';
    END IF;
    RETURN old;
  END IF;

  -- UPDATE: reviewed tasks always locked
  IF old.status = 'reviewed' THEN
    RAISE EXCEPTION 'Reviewed tasks are locked.';
  END IF;

  IF old.status IS DISTINCT FROM new.status THEN
    IF actor IS NOT NULL THEN
      IF actor_role = 'intern' THEN
        -- Interns: strict forward-only flow on their own tasks only
        IF old.assigned_to IS DISTINCT FROM actor THEN
          RAISE EXCEPTION 'Interns can only advance their own tasks.';
        END IF;
        IF new.status IN ('reviewed', 'on_hold') THEN
          RAISE EXCEPTION 'Only supervisors or admins can set this status.';
        END IF;
        IF NOT ((old.status, new.status) IN (
          ('assigned',    'acknowledged'),
          ('acknowledged','in_progress'),
          ('in_progress', 'completed')
        )) THEN
          RAISE EXCEPTION 'Invalid task status transition: % → %', old.status, new.status;
        END IF;

      ELSIF actor_role IN ('admin', 'supervisor') THEN
        -- Admins and supervisors can freely move tasks to any valid status
        IF new.status NOT IN ('assigned','acknowledged','in_progress','on_hold','completed','reviewed') THEN
          RAISE EXCEPTION 'Invalid status: %', new.status;
        END IF;
      END IF;
    END IF;
  END IF;

  -- Interns may only touch status and output_link
  IF actor IS NOT NULL AND actor_role = 'intern' THEN
    IF (old.title, old.description, old.assigned_to, old.assigned_by, old.priority,
        COALESCE(old.due_date, '1900-01-01'), COALESCE(old.industry_category, ''),
        COALESCE(old.output_type, ''), COALESCE(old.skills, '{}'))
       IS DISTINCT FROM
       (new.title, new.description, new.assigned_to, new.assigned_by, new.priority,
        COALESCE(new.due_date, '1900-01-01'), COALESCE(new.industry_category, ''),
        COALESCE(new.output_type, ''), COALESCE(new.skills, '{}')) THEN
      RAISE EXCEPTION 'Interns can only update a task''s status and output link.';
    END IF;
  END IF;

  RETURN new;
END;
$$;
