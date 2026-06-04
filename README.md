# Boulder Tracker 🧗‍♂️

App mobile-first per tracciare e navigare verso nuovi blocchi di boulder.

## Funzionalità
- **Dashboard**: Lista dei blocchi con filtri per stato (Nuovo, Pulito, Progetto).
- **Mappa**: Visualizzazione geografica dei blocchi con Google Maps.
- **Creazione Blocco**: Salvataggio automatico coordinate GPS e dettagli tecnici.
- **Guidami**: Bussola direzionale in tempo reale per raggiungere il blocco nel bosco.
- **Offline Ready**: Design ottimizzato per l'uso outdoor.

## Setup
1. Inserisci la tua `VITE_GOOGLE_MAPS_API_KEY` nei segreti del progetto.
2. Firebase è già configurato tramite `firebase-applet-config.json`.
3. Esegui `npm install` e `npm run dev`.

## Stack Tecnico
- React 19 + Vite
- Firebase Auth & Firestore
- Google Maps JavaScript API
- Framer Motion (per animazioni)
- Tailwind CSS 4
- Geolocation & Device Orientation API
