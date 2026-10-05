import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { signedSelfieUrl } from './storage';

// Every key carries the account, so a shared phone never shows one person's
// deck, matches or signed pictures to the next.
const meetKeys = {
  all: (userId) => ['meet', userId],
  settings: (userId) => ['meet', userId, 'settings'],
  deck: (userId, eventId) => ['meet', userId, 'deck', eventId],
  matches: (userId) => ['meet', userId, 'matches'],
  avatar: (userId, path) => ['meet', userId, 'avatar', path],
};
const SWIPE_KEY = ['meet', 'swipe'];

export const MEET_INTENTS = [
  { id: 'friendship', label: 'Friendship' },
  { id: 'collab', label: 'Collab' },
  { id: 'mentorship', label: 'Mentorship' },
  { id: 'romance', label: 'Romance' },
];

export function useMeetSettings(userId) {
  return useQuery({
    queryKey: meetKeys.settings(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meet_settings')
        .select('visible, intents')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data ?? { visible: false, intents: [] };
    },
  });
}

// Resolves once the settings have been read back, so the page never shows the
// old state after a save.
export function useSaveMeetSettings(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visible, intents }) => {
      const { error } = await supabase
        .from('meet_settings')
        .upsert({ user_id: userId, visible, intents }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: meetKeys.all(userId) }),
  });
}

export function useMeetDeck(userId, eventId) {
  return useQuery({
    queryKey: meetKeys.deck(userId, eventId),
    enabled: Boolean(userId && eventId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('meet_deck', { p_event_id: eventId });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// The card leaves the deck as soon as it is swiped. The deck is refetched only
// once no other swipe is in flight, so a refetch cannot bring back a card that
// was swiped a moment ago.
export function useRecordSwipe(userId, eventId) {
  const qc = useQueryClient();
  const deckKey = meetKeys.deck(userId, eventId);
  return useMutation({
    mutationKey: SWIPE_KEY,
    mutationFn: async ({ card, direction }) => {
      const { data, error } = await supabase.rpc('record_swipe', {
        p_target_id: card.id,
        p_event_id: eventId,
        p_direction: direction,
      });
      if (error) throw error;
      return data?.[0] ?? { matched: false };
    },
    onMutate: async ({ card }) => {
      await qc.cancelQueries({ queryKey: deckKey });
      qc.setQueryData(deckKey, (cards = []) => cards.filter((c) => c.id !== card.id));
    },
    // Not recorded, so the card goes back on top to be swiped again.
    onError: (_err, { card }) => {
      qc.setQueryData(deckKey, (cards = []) => (cards.some((c) => c.id === card.id) ? cards : [card, ...cards]));
    },
    onSuccess: (result) => {
      if (result.matched) qc.invalidateQueries({ queryKey: meetKeys.matches(userId) });
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: SWIPE_KEY }) === 1) {
        qc.invalidateQueries({ queryKey: deckKey });
      }
    },
  });
}

export function useMyMatches(userId) {
  return useQuery({
    queryKey: meetKeys.matches(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_matches');
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Profile pictures are in the private selfies bucket, and the database decides
// who may sign one. Anyone it refuses gets null, and the card shows an initial.
export function useSignedAvatar(userId, path) {
  return useQuery({
    queryKey: meetKeys.avatar(userId, path),
    enabled: Boolean(userId && path),
    // Signed for an hour, so re-sign before the link runs out.
    staleTime: 50 * 60 * 1000,
    queryFn: () => signedSelfieUrl(path),
  });
}
