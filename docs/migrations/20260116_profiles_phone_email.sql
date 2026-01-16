-- Migration: Add phone_e164 and email columns to profiles table
-- Run this in Supabase SQL Editor

-- Add phone_e164 column if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_e164 text;

-- Add email column if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Create index on phone_e164 for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_phone_e164 ON public.profiles(phone_e164) WHERE phone_e164 IS NOT NULL;

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email) WHERE email IS NOT NULL;
