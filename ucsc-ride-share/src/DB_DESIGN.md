CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enum/type: destination_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'destination_type'
  ) THEN
    CREATE TYPE destination_type AS ENUM ('CORE_WEST', 'WEST_REMOTE', 'EAST_REMOTE');
  END IF;
END$$;

-- Table: profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL,
  ucsc_email text NOT NULL,
  gender text,
  age integer,
  car_model text,
  car_color text,
  license_plate text,
  preferred_role text,
  default_passengers integer,
  pref_walk_minutes integer,
  pref_time_window text,
  pref_destination text,
  created_at timestamptz DEFAULT now(),
  password text,
  username text
);

-- Note: profiles has a foreign key reference to auth.users (managed by Supabase auth)
-- Create FK to auth.users if auth schema exists (this will fail if auth.users isn't present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    BEGIN
      ALTER TABLE public.profiles
        ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);
    EXCEPTION WHEN duplicate_object THEN
      -- constraint already exists, ignore
      NULL;
    END;
  END IF;
END$$;

-- Table: trips
CREATE TABLE IF NOT EXISTS public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  destination destination_type NOT NULL,
  start_lat double precision NOT NULL,
  start_lng double precision NOT NULL,
  polyline text NOT NULL,
  departure_time timestamptz NOT NULL,
  estimated_arrival_time timestamptz NOT NULL,
  total_seats integer NOT NULL,
  seats_taken integer DEFAULT 0,
  status text DEFAULT 'SCHEDULED'
);

-- Foreign key: trips.driver_id -> profiles.id
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.trips
      ADD CONSTRAINT trips_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.profiles(id);
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END$$;

-- Table: bookings
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  rider_id uuid NOT NULL,
  pickup_lat double precision NOT NULL,
  pickup_lng double precision NOT NULL,
  walking_distance_meters integer,
  status text DEFAULT 'CONFIRMED',
  created_at timestamptz DEFAULT now()
);

-- Foreign keys: bookings.trip_id -> trips.id, bookings.rider_id -> profiles.id
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id);
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.profiles(id);
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END$$;
