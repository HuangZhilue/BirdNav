import { StoreProvider } from './store/StoreContext';
import MapCanvas from './components/MapComponent';

export default function App() {
  return (
    <StoreProvider>
      <main className="flex flex-col w-full h-screen bg-[#1a1c1e] text-slate-200 font-sans overflow-hidden">
        <MapCanvas />
      </main>
    </StoreProvider>
  );
}

