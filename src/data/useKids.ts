// GD Screen 10 (CONTRACT v0.13 §4 "Demo features"): homework → practice, chores, routines and Mega Bucks.
// Reads that load one item by id go through `useQueryState`, so a card whose item is gone, forbidden or
// still a GD stub renders a fallback line instead of throwing into the chat thread.
import { useMutation } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import type { RoutineKind } from '@shared/config/kids';
import { api } from './api';
import { useQueryState } from './useQuery';

export function useHomeworkSheet(sheetId: Id<'homeworkSheets'>) {
  return useQueryState(api.homework.sheet, { sheetId });
}

export function usePractice(setId: Id<'practiceSets'>) {
  return useQueryState(api.practice.get, { setId });
}

export function useChoreClaim(claimId: Id<'choreClaims'>) {
  return useQueryState(api.chores.claim, { claimId });
}

/** The kid's own run for today (memberId omitted), or one kid's run for a parent. */
export function useRoutineToday(kind: RoutineKind, memberId?: Id<'members'>) {
  return useQueryState(api.routines.today, memberId ? { kind, memberId } : { kind });
}

/** One routine run by id (GD v0.13a `routines.run`), so a card from any day renders. */
export function useRoutineRun(runId: Id<'routineRuns'>) {
  return useQueryState(api.routines.run, { runId });
}

/** One Mega Bucks ledger row by id (GD v0.13a `bucks.entry`). */
export function useBucksEntry(ledgerId: Id<'bucksLedger'>) {
  return useQueryState(api.bucks.entry, { ledgerId });
}

export function useBucksBalance(memberId?: Id<'members'>) {
  return useQueryState(api.bucks.balance, memberId ? { memberId } : {});
}

export function useHomeworkActions() {
  return {
    uploadUrl: useMutation(api.files.uploadUrl),
    submit: useMutation(api.homework.submit),
    makePractice: useMutation(api.homework.makePractice),
  };
}

export function usePracticeActions() {
  return { answer: useMutation(api.practice.answer), hint: useMutation(api.practice.hint) };
}

export function useChoreActions() {
  return { markDone: useMutation(api.chores.markDone), decline: useMutation(api.chores.decline) };
}

export function useCheckRoutineStep() {
  return useMutation(api.routines.check);
}

export function useReleaseBucks() {
  return useMutation(api.bucks.release);
}
