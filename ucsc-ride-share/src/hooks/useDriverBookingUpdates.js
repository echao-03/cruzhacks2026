import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

function useDriverBookingUpdates({ tripId, onNewWaypoint, onToast }) {
  const seenBookingIdsRef = useRef(new Set());

  useEffect(() => {
    if (!supabase || !tripId) {
      return undefined;
    }

    const channel = supabase
      .channel(`bookings:${tripId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bookings',
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          const booking = payload?.new;
          const bookingId = booking?.id;

          if (bookingId && seenBookingIdsRef.current.has(bookingId)) {
            return;
          }

          if (bookingId) {
            seenBookingIdsRef.current.add(bookingId);
          }

          if (booking?.status && booking.status !== 'CONFIRMED') {
            return;
          }

          const lat = Number(booking?.pickup_lat);
          const lng = Number(booking?.pickup_lng);

          if (Number.isNaN(lat) || Number.isNaN(lng)) {
            return;
          }

          onNewWaypoint?.({
            location: { lat, lng },
            stopover: true,
          });

          onToast?.('New Rider Added!');
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, onNewWaypoint, onToast]);
}

export { useDriverBookingUpdates };
