import { StoreProvider } from './store/StoreContext';
import MapCanvas from './components/MapComponent';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';

export default function App() {
  return (
    <StoreProvider>
      <main className="relative flex flex-col w-full h-[100dvh] bg-[#1a1c1e] text-slate-200 font-sans overflow-hidden">
        <PWAInstallPrompt />
        <MapCanvas />
      </main>
    </StoreProvider>
  );
}

