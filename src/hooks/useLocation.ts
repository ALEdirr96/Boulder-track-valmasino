import { useState, useEffect, useCallback } from 'react';
import { UserLocation } from '../types';

export function useLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsCompassPermission, setNeedsCompassPermission] = useState(false);

  const handleOrientation = useCallback((event: DeviceOrientationEvent | Event) => {
    const orientationEvent = event as DeviceOrientationEvent;
    let heading = null;
    
    if (typeof (orientationEvent as any).webkitCompassHeading !== 'undefined') {
      // iOS
      heading = (orientationEvent as any).webkitCompassHeading;
    } else if (orientationEvent.alpha !== null) {
      // Android
      heading = 360 - orientationEvent.alpha;
    }

    if (heading !== null) {
      setLocation((prev) => prev ? ({
        ...prev,
        heading,
      }) : null);
    }
  }, []);

  const requestCompassPermission = useCallback(() => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission()
        .then((response: string) => {
          if (response === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation, true);
            setNeedsCompassPermission(false);
          }
        })
        .catch(console.error);
    }
  }, [handleOrientation]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocalizzazione non supportata');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation((prev) => ({
          ...prev,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: prev?.heading ?? null,
        }));
        setError(null);
      },
      (err) => {
        let errorMessage = 'Errore sconosciuto';
        switch (err.code) {
          case err.PERMISSION_DENIED:
            errorMessage = 'Permesso di geolocalizzazione negato. Controlla le impostazioni del browser.';
            break;
          case err.POSITION_UNAVAILABLE:
            errorMessage = 'Posizione non disponibile. Assicurati che il GPS sia attivo.';
            break;
          case err.TIMEOUT:
            errorMessage = 'Tempo scaduto nel recupero della posizione. Riprova.';
            break;
        }
        setError(errorMessage);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
    );

    // Request permission for iOS 13+
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      setNeedsCompassPermission(true);
    } else {
      window.addEventListener('deviceorientationabsolute', handleOrientation as any, true);
      window.addEventListener('deviceorientation', handleOrientation, true);
    }

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.removeEventListener('deviceorientationabsolute', handleOrientation as any);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [handleOrientation]);

  return { location, error, needsCompassPermission, requestCompassPermission };
}
