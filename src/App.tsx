import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  Smartphone, 
  MapPin, 
  ShieldCheck, 
  History, 
  AlertCircle, 
  CheckCircle2,
  Navigation,
  Loader2,
  Info,
  X,
  ArrowRight,
  Plus,
  Activity,
  Globe,
  Clock,
  Trash2,
  Settings,
  Database,
  Cpu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet default marker icon issue
const markerIconSvg = `
  <svg width="25" height="41" viewBox="0 0 25 41" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.5 0C5.59645 0 0 5.59645 0 12.5C0 21.875 12.5 41 12.5 41C12.5 41 25 21.875 25 12.5C25 5.59645 19.4036 0 12.5 0ZM12.5 17C10.0147 17 8 14.9853 8 12.5C8 10.0147 10.0147 8 12.5 8C14.9853 8 17 10.0147 17 12.5C17 14.9853 14.9853 17 12.5 17Z" fill="#4F46E5"/>
  </svg>
`;

const DefaultIcon = L.divIcon({
    html: markerIconSvg,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    className: 'custom-leaflet-icon'
});

L.Marker.prototype.options.icon = DefaultIcon;

// Component to update map center when location changes
function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

interface DeviceLocation {
  latitude: number;
  longitude: number;
  timestamp: string;
}

interface DeviceInfo {
  imei: string;
  name: string;
  model?: string;
  color?: string;
  storage?: string;
}

export default function App() {
  const [view, setView] = useState<'home' | 'register' | 'manage' | 'tracker'>('home');
  const [imeiInput, setImeiInput] = useState('');
  const [searchResult, setSearchResult] = useState<{ device: DeviceInfo; location: DeviceLocation | null } | null>(null);
  const [locationHistory, setLocationHistory] = useState<DeviceLocation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [allDevices, setAllDevices] = useState<DeviceInfo[]>([]);
  const [devicesWithLocations, setDevicesWithLocations] = useState<(DeviceInfo & { location: DeviceLocation | null })[]>([]);

  // Registration state
  const [regName, setRegName] = useState('');
  const [regImei, setRegImei] = useState('');
  const [regModel, setRegModel] = useState('');
  const [regColor, setRegColor] = useState('');
  const [regStorage, setRegStorage] = useState('');
  const [isTracking, setIsTracking] = useState(false);

  const fetchWithRetry = async (url: string, options?: RequestInit, retries = 3): Promise<Response> => {
    console.log(`Fetching: ${url} (Retries left: ${retries})`);
    try {
      const res = await fetch(url, options);
      if (!res.ok && retries > 0) {
        console.warn(`Fetch failed for ${url} with status ${res.status}. Retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchWithRetry(url, options, retries - 1);
      }
      return res;
    } catch (err) {
      if (retries > 0) {
        console.warn(`Fetch error for ${url}: ${err}. Retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchWithRetry(url, options, retries - 1);
      }
      throw err;
    }
  };

  const fetchDevices = async () => {
    try {
      const res = await fetchWithRetry('/api/devices');
      if (res.ok) {
        const data = await res.json();
        setAllDevices(data);
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error("Server error fetching devices:", res.status, errorData);
      }
    } catch (err) {
      console.error("Network error fetching devices:", err);
    }
  };

  const fetchDevicesWithLocations = async () => {
    try {
      const res = await fetchWithRetry('/api/devices-with-locations');
      if (res.ok) {
        const data = await res.json();
        setDevicesWithLocations(data);
      }
    } catch (err) {
      console.error("Failed to fetch devices with locations", err);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('recent_searches');
    if (saved) setRecentSearches(JSON.parse(saved));
    fetchDevices();
    fetchDevicesWithLocations();
  }, []);

  useEffect(() => {
    if (view === 'manage') fetchDevices();
    if (view === 'tracker') fetchDevicesWithLocations();
  }, [view]);

  useEffect(() => {
    let interval: number;
    if (view === 'tracker') {
      interval = window.setInterval(fetchDevicesWithLocations, 10000);
    }
    return () => clearInterval(interval);
  }, [view]);

  const saveSearch = (imei: string) => {
    const updated = [imei, ...recentSearches.filter(i => i !== imei)].slice(0, 3);
    setRecentSearches(updated);
    localStorage.setItem('recent_searches', JSON.stringify(updated));
  };

  // Handle Finding Device
  const handleFind = async (e?: React.FormEvent, manualImei?: string) => {
    if (e) e.preventDefault();
    const targetImei = manualImei || imeiInput;
    
    if (targetImei.length < 14) {
      setError("Please enter a valid IMEI number (15 digits)");
      return;
    }

    setLoading(true);
    setError(null);
    setSearchResult(null);

    try {
      const res = await fetch(`/api/find/${targetImei}`);
      const data = await res.json();
      if (res.ok) {
        setSearchResult(data);
        saveSearch(targetImei);
        
        // Fetch history
        const historyRes = await fetch(`/api/history/${targetImei}`);
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          setLocationHistory(historyData);
        }
      } else {
        setError(data.error || "Device not found");
      }
    } catch (err) {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  // Handle Registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          imei: regImei, 
          name: regName,
          model: regModel,
          color: regColor,
          storage: regStorage
        }),
      });
      if (res.ok) {
        setSuccess("Device registered successfully!");
        setRegName('');
        setRegImei('');
        setRegModel('');
        setRegColor('');
        setRegStorage('');
        setTimeout(() => setSuccess(null), 3000);
        localStorage.setItem('my_imei', regImei);
        localStorage.setItem('my_device_name', regName);
        fetchDevices();
      } else {
        setError("Registration failed");
      }
    } catch (err) {
      setError("Server error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDevice = async (imei: string) => {
    if (!confirm("Are you sure you want to remove this device? All location history will be deleted.")) return;
    try {
      const res = await fetch(`/api/devices/${imei}`, { method: 'DELETE' });
      if (res.ok) {
        setAllDevices(allDevices.filter(d => d.imei !== imei));
        if (localStorage.getItem('my_imei') === imei) {
          localStorage.removeItem('my_imei');
          setIsTracking(false);
        }
      }
    } catch (err) {
      setError("Failed to delete device");
    }
  };

  // Simulate Location Reporting
  const reportLocation = useCallback(async () => {
    const storedImei = localStorage.getItem('my_imei');
    if (!storedImei || !isTracking) return;

    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        await fetch('/api/update-location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imei: storedImei,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          }),
        });
      } catch (err) {
        console.error("Failed to report location");
      }
    }, (err) => {
      console.error("Geolocation error:", err);
    });
  }, [isTracking]);

  useEffect(() => {
    let interval: number;
    if (isTracking) {
      reportLocation();
      interval = window.setInterval(reportLocation, 15000); // Every 15s for demo
    }
    return () => clearInterval(interval);
  }, [isTracking, reportLocation]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 selection:bg-indigo-100 selection:text-indigo-700">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer group" 
            onClick={() => setView('home')}
          >
            <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform duration-300">
              <Smartphone className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight leading-none">IMEI Finder</h1>
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 mt-1">Device Recovery</p>
            </div>
          </div>
          
          <nav className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-2xl border border-slate-200/50">
            <button 
              onClick={() => setView('home')}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${view === 'home' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Find
            </button>
            <button 
              onClick={() => setView('register')}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${view === 'register' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Register
            </button>
            <button 
              onClick={() => setView('manage')}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${view === 'manage' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Manage
            </button>
            <button 
              onClick={() => setView('tracker')}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${view === 'tracker' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Tracker
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pt-32 pb-24">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="space-y-12"
            >
              {/* Hero */}
              <div className="text-center space-y-6 max-w-3xl mx-auto">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-full border border-indigo-100 text-indigo-600 text-xs font-bold uppercase tracking-wider"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Secure Device Recovery System
                </motion.div>
                <h2 className="text-5xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.1]">
                  Lost your phone? <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Find it instantly.</span>
                </h2>
                <p className="text-slate-500 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
                  Enter your unique 15-digit IMEI number to pinpoint your device's exact location on the map.
                </p>
              </div>

              {/* Search Box */}
              <div className="max-w-2xl mx-auto">
                <div className="relative group">
                  <form onSubmit={handleFind} className="relative z-10">
                    <input 
                      type="text"
                      placeholder="Enter 15-digit IMEI Number..."
                      value={imeiInput}
                      onChange={(e) => setImeiInput(e.target.value.replace(/\D/g, '').slice(0, 15))}
                      className="w-full bg-white border-2 border-slate-200 rounded-[2rem] px-8 py-6 pl-16 text-xl focus:border-indigo-500 focus:ring-8 focus:ring-indigo-500/5 outline-none transition-all shadow-xl shadow-slate-200/50"
                    />
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 w-7 h-7 group-focus-within:text-indigo-600 transition-colors" />
                    
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      {imeiInput && (
                        <button 
                          type="button"
                          onClick={() => setImeiInput('')}
                          className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      )}
                      <button 
                        type="submit"
                        disabled={loading || imeiInput.length < 14}
                        className="bg-indigo-600 text-white px-8 py-3.5 rounded-2xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-indigo-200 active:scale-95"
                      >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Locate Device'}
                      </button>
                    </div>
                  </form>
                  <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-[2.2rem] blur opacity-0 group-focus-within:opacity-20 transition-opacity" />
                </div>

                {/* Recent Searches */}
                {recentSearches.length > 0 && !searchResult && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-6 flex items-center gap-3 justify-center"
                  >
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Recent:</span>
                    {recentSearches.map((imei) => (
                      <button
                        key={imei}
                        onClick={() => { setImeiInput(imei); handleFind(undefined, imei); }}
                        className="text-xs font-mono bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-all"
                      >
                        {imei.slice(0, 4)}...{imei.slice(-4)}
                      </button>
                    ))}
                  </motion.div>
                )}

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-6 p-5 bg-red-50 border border-red-100 rounded-3xl flex items-center gap-4 text-red-600"
                  >
                    <div className="bg-red-100 p-2 rounded-xl">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-bold">{error}</span>
                  </motion.div>
                )}
              </div>

              {/* Results Dashboard */}
              {searchResult && (
                <motion.div 
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid lg:grid-cols-12 gap-8 items-start"
                >
                  {/* Info Card */}
                  <div className="lg:col-span-5 space-y-6">
                    <div className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/60 border border-slate-100 space-y-8">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <h3 className="text-2xl font-black text-slate-900">Device Found</h3>
                          <p className="text-slate-400 text-sm font-medium">Tracking active via IMEI</p>
                        </div>
                        <div className="bg-emerald-50 p-4 rounded-3xl border border-emerald-100">
                          <Activity className="text-emerald-600 w-6 h-6 animate-pulse" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50/80 p-5 rounded-3xl border border-slate-100 flex items-start gap-3">
                          <div className="bg-white p-2 rounded-xl shadow-sm">
                            <Smartphone className="w-4 h-4 text-indigo-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-0.5">Device Name</p>
                            <p className="font-bold text-slate-900 truncate">{searchResult.device.name}</p>
                          </div>
                        </div>
                        <div className="bg-slate-50/80 p-5 rounded-3xl border border-slate-100 flex items-start gap-3">
                          <div className="bg-white p-2 rounded-xl shadow-sm">
                            <ShieldCheck className="w-4 h-4 text-indigo-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-0.5">IMEI ID</p>
                            <p className="font-mono font-bold text-indigo-600 truncate">*{searchResult.device.imei.slice(-6)}</p>
                          </div>
                        </div>
                        {searchResult.device.model && (
                          <div className="bg-slate-50/80 p-5 rounded-3xl border border-slate-100 flex items-start gap-3">
                            <div className="bg-white p-2 rounded-xl shadow-sm">
                              <Cpu className="w-4 h-4 text-indigo-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-0.5">Model</p>
                              <p className="font-bold text-slate-900 truncate">{searchResult.device.model}</p>
                            </div>
                          </div>
                        )}
                        {searchResult.device.storage && (
                          <div className="bg-slate-50/80 p-5 rounded-3xl border border-slate-100 flex items-start gap-3">
                            <div className="bg-white p-2 rounded-xl shadow-sm">
                              <Database className="w-4 h-4 text-indigo-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-0.5">Storage</p>
                              <p className="font-bold text-slate-900 truncate">{searchResult.device.storage}</p>
                            </div>
                          </div>
                        )}
                        {searchResult.device.color && (
                          <div className="bg-slate-50/80 p-5 rounded-3xl border border-slate-100 flex items-start gap-3 col-span-2">
                            <div className="bg-white p-2 rounded-xl shadow-sm">
                              <div className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: searchResult.device.color.toLowerCase() }} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-0.5">Color Finish</p>
                              <p className="font-bold text-slate-900 truncate">{searchResult.device.color}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl">
                          <div className="flex items-center gap-3">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <span className="text-sm font-bold text-slate-500">Last Updated</span>
                          </div>
                          <span className="text-sm font-black text-slate-900">
                            {searchResult.location ? new Date(searchResult.location.timestamp).toLocaleTimeString() : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl">
                          <div className="flex items-center gap-3">
                            <Globe className="w-4 h-4 text-slate-400" />
                            <span className="text-sm font-bold text-slate-500">Network Status</span>
                          </div>
                          <span className="flex items-center gap-2 text-emerald-600 text-sm font-black">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                            ONLINE
                          </span>
                        </div>
                      </div>

                      <button 
                        onClick={() => window.open(`https://www.google.com/maps?q=${searchResult.location?.latitude},${searchResult.location?.longitude}`, '_blank')}
                        className="w-full bg-indigo-600 text-white py-5 rounded-[2rem] font-black flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 group"
                      >
                        <Navigation className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                        Navigate to Device
                      </button>

                      <button 
                        onClick={() => setShowHistory(!showHistory)}
                        className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all border-2 ${showHistory ? 'bg-violet-50 border-violet-200 text-violet-600' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'}`}
                      >
                        <History className="w-5 h-5" />
                        {showHistory ? 'Hide Movement Trail' : 'Show Movement Trail'}
                      </button>
                    </div>
                  </div>

                  {/* Map View */}
                  <div className="lg:col-span-7 h-[500px] bg-slate-200 rounded-[3rem] overflow-hidden relative shadow-2xl shadow-slate-300/50 group">
                    {searchResult.location ? (
                      <div className="w-full h-full relative">
                        <MapContainer 
                          center={[searchResult.location.latitude, searchResult.location.longitude]} 
                          zoom={13} 
                          scrollWheelZoom={true}
                          className="w-full h-full"
                        >
                          <ChangeView center={[searchResult.location.latitude, searchResult.location.longitude]} zoom={13} />
                          <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          />
                          
                          {showHistory && locationHistory.length > 1 && (
                            <Polyline 
                              positions={locationHistory.map(loc => [loc.latitude, loc.longitude] as [number, number])}
                              color="#6366f1"
                              weight={4}
                              opacity={0.6}
                              dashArray="10, 10"
                            />
                          )}

                          {showHistory && locationHistory.map((loc, idx) => (
                            idx !== 0 && (
                              <Marker 
                                key={idx} 
                                position={[loc.latitude, loc.longitude]}
                                icon={L.divIcon({
                                  html: `<div class="w-2 h-2 bg-indigo-400 rounded-full border border-white"></div>`,
                                  className: 'dummy-class',
                                  iconSize: [8, 8],
                                  iconAnchor: [4, 4]
                                })}
                              >
                                <Popup>
                                  <p className="text-[10px] font-bold">Passed here at {new Date(loc.timestamp).toLocaleTimeString()}</p>
                                </Popup>
                              </Marker>
                            )
                          ))}

                          <Marker position={[searchResult.location.latitude, searchResult.location.longitude]}>
                            <Popup>
                              <div className="p-1">
                                <p className="font-bold text-slate-900">{searchResult.device.name}</p>
                                <p className="text-xs text-slate-500">Last seen: {new Date(searchResult.location.timestamp).toLocaleTimeString()}</p>
                              </div>
                            </Popup>
                          </Marker>
                        </MapContainer>

                        {/* Coordinates Overlay */}
                        <div className="absolute bottom-8 left-8 right-8 glass p-6 rounded-[2rem] flex items-center justify-between z-[1000]">
                          <div className="flex items-center gap-4">
                            <div className="bg-indigo-600 p-3 rounded-2xl">
                              <MapPin className="text-white w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Live Coordinates</p>
                              <p className="font-mono font-bold text-slate-900">
                                {searchResult.location.latitude.toFixed(6)}°N, {searchResult.location.longitude.toFixed(6)}°E
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Accuracy</p>
                            <p className="font-bold text-emerald-600">± 5 meters</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center space-y-4">
                        <div className="bg-white/50 backdrop-blur p-8 rounded-full">
                          <Globe className="w-16 h-16 text-slate-400" />
                        </div>
                        <h4 className="text-xl font-bold text-slate-600">Waiting for Signal...</h4>
                        <p className="text-slate-400 max-w-xs">The device is registered but hasn't reported its location yet.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Features Grid */}
              {!searchResult && (
                <div className="grid md:grid-cols-3 gap-8 pt-12">
                  {[
                    { icon: ShieldCheck, title: "Military Grade", desc: "Your data is encrypted using AES-256 standards for maximum privacy.", color: "indigo" },
                    { icon: History, title: "Trace History", desc: "Access the last 24 hours of movement logs to see where your device traveled.", color: "violet" },
                    { icon: Globe, title: "Global Network", desc: "Our system works across all major carriers and regions worldwide.", color: "emerald" }
                  ].map((feature, i) => (
                    <motion.div 
                      key={i} 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.1 }}
                      className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                    >
                      <div className={`bg-${feature.color}-50 w-16 h-16 rounded-3xl flex items-center justify-center mb-6`}>
                        <feature.icon className={`text-${feature.color}-600 w-8 h-8`} />
                      </div>
                      <h4 className="text-xl font-black text-slate-900 mb-3">{feature.title}</h4>
                      <p className="text-slate-500 text-sm leading-relaxed font-medium">{feature.desc}</p>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {view === 'register' && (
            <motion.div 
              key="register"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-4xl mx-auto grid md:grid-cols-2 gap-12 items-center"
            >
              <div className="space-y-8">
                <div className="space-y-4">
                  <h2 className="text-5xl font-black text-slate-900 tracking-tight">Protect your <span className="text-indigo-600">Identity.</span></h2>
                  <p className="text-slate-500 text-lg leading-relaxed">
                    Registering your device takes less than a minute and ensures you can always find it, no matter where it goes.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="bg-indigo-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-black flex-shrink-0">1</div>
                    <p className="text-slate-600 font-bold">Dial *#06# to get your IMEI</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="bg-indigo-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-black flex-shrink-0">2</div>
                    <p className="text-slate-600 font-bold">Enter device details below</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="bg-indigo-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-black flex-shrink-0">3</div>
                    <p className="text-slate-600 font-bold">Enable live tracking</p>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
                  <div className="bg-amber-50 p-3 rounded-2xl">
                    <Info className="text-amber-600 w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-slate-500 leading-relaxed">
                    We never share your IMEI with third parties. Your data is strictly used for recovery purposes.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-[3rem] p-10 shadow-2xl shadow-slate-200/60 border border-slate-100 space-y-8">
                <form onSubmit={handleRegister} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Device Nickname</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. Work iPhone"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">IMEI Number</label>
                    <input 
                      type="text"
                      required
                      placeholder="15-digit identifier"
                      value={regImei}
                      onChange={(e) => setRegImei(e.target.value.replace(/\D/g, '').slice(0, 15))}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 focus:border-indigo-500 focus:bg-white outline-none transition-all font-mono font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Model</label>
                      <input 
                        type="text"
                        placeholder="e.g. iPhone 15"
                        value={regModel}
                        onChange={(e) => setRegModel(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Storage</label>
                      <input 
                        type="text"
                        placeholder="e.g. 256GB"
                        value={regStorage}
                        onChange={(e) => setRegStorage(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Color</label>
                    <input 
                      type="text"
                      placeholder="e.g. Space Gray"
                      value={regColor}
                      onChange={(e) => setRegColor(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100/50">
                    <div className="space-y-1">
                      <h4 className="font-black text-indigo-900 text-sm">Live Tracking</h4>
                      <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">Background reporting</p>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setIsTracking(!isTracking)}
                      className={`relative w-16 h-9 rounded-full transition-all duration-500 ${isTracking ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <div className={`absolute top-1.5 left-1.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-500 ${isTracking ? 'translate-x-7' : ''}`} />
                    </button>
                  </div>

                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full bg-indigo-600 text-white py-5 rounded-[2rem] font-black text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-[0.98]"
                  >
                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                      <>
                        <Plus className="w-6 h-6" />
                        Complete Registration
                      </>
                    )}
                  </button>
                </form>

                <AnimatePresence>
                  {success && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="p-5 bg-emerald-50 border border-emerald-100 rounded-3xl flex items-center gap-4 text-emerald-600"
                    >
                      <div className="bg-emerald-100 p-2 rounded-xl">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <span className="text-sm font-black">{success}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {view === 'manage' && (
            <motion.div 
              key="manage"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              className="space-y-12"
            >
              <div className="text-center space-y-4 max-w-2xl mx-auto">
                <h2 className="text-4xl font-black text-slate-900">Device Management</h2>
                <p className="text-slate-500 font-medium">View and manage all devices registered to your recovery network.</p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {allDevices.length > 0 ? (
                  allDevices.map((device) => (
                    <motion.div 
                      key={device.imei}
                      layout
                      className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm hover:shadow-xl transition-all group"
                    >
                      <div className="flex items-start justify-between mb-6">
                        <div className="bg-indigo-50 p-4 rounded-3xl">
                          <Smartphone className="text-indigo-600 w-6 h-6" />
                        </div>
                        <button 
                          onClick={() => handleDeleteDevice(device.imei)}
                          className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <h4 className="text-xl font-black text-slate-900">{device.name}</h4>
                          <p className="text-xs font-mono text-slate-400 mt-1">{device.imei}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {device.model && (
                            <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                              <p className="text-[8px] uppercase font-black text-slate-400 tracking-widest">Model</p>
                              <p className="text-[10px] font-bold text-slate-700 truncate">{device.model}</p>
                            </div>
                          )}
                          {device.storage && (
                            <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                              <p className="text-[8px] uppercase font-black text-slate-400 tracking-widest">Storage</p>
                              <p className="text-[10px] font-bold text-slate-700 truncate">{device.storage}</p>
                            </div>
                          )}
                        </div>

                        <button 
                          onClick={() => { setImeiInput(device.imei); setView('home'); handleFind(undefined, device.imei); }}
                          className="w-full mt-4 bg-slate-900 text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-indigo-600 transition-all active:scale-95"
                        >
                          <Search className="w-4 h-4" />
                          Locate Now
                        </button>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-full py-20 text-center space-y-6">
                    <div className="bg-slate-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto">
                      <Database className="w-10 h-10 text-slate-300" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xl font-bold text-slate-400">No devices found</h4>
                      <p className="text-slate-300 text-sm">Register your first device to start tracking.</p>
                    </div>
                    <button 
                      onClick={() => setView('register')}
                      className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all"
                    >
                      Register Device
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {view === 'tracker' && (
            <motion.div 
              key="tracker"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              className="space-y-8"
            >
              <div className="text-center space-y-4 max-w-2xl mx-auto">
                <h2 className="text-4xl font-black text-slate-900">Live GPS Tracker</h2>
                <p className="text-slate-500 font-medium">Real-time overview of all devices in your network.</p>
              </div>

              <div className="h-[600px] bg-slate-200 rounded-[3rem] overflow-hidden relative shadow-2xl shadow-slate-300/50">
                <MapContainer 
                  center={[20, 0]} 
                  zoom={2} 
                  scrollWheelZoom={true}
                  className="w-full h-full"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {devicesWithLocations.map((device) => (
                    device.location && (
                      <Marker 
                        key={device.imei} 
                        position={[device.location.latitude, device.location.longitude]}
                      >
                        <Popup>
                          <div className="p-2 min-w-[150px]">
                            <h4 className="font-black text-slate-900 mb-1">{device.name}</h4>
                            <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-2">{device.model || 'Unknown Model'}</p>
                            <div className="space-y-1 border-t border-slate-100 pt-2">
                              <p className="text-[10px] text-slate-500 flex justify-between">
                                <span>IMEI:</span>
                                <span className="font-mono">*{device.imei.slice(-6)}</span>
                              </p>
                              <p className="text-[10px] text-slate-500 flex justify-between">
                                <span>Last Seen:</span>
                                <span>{new Date(device.location.timestamp).toLocaleTimeString()}</span>
                              </p>
                            </div>
                            <button 
                              onClick={() => { setImeiInput(device.imei); setView('home'); handleFind(undefined, device.imei); }}
                              className="w-full mt-3 bg-indigo-600 text-white py-2 rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-all"
                            >
                              Detailed View
                            </button>
                          </div>
                        </Popup>
                      </Marker>
                    )
                  ))}
                </MapContainer>

                {/* Legend Overlay */}
                <div className="absolute top-6 right-6 glass p-4 rounded-2xl z-[1000] space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-indigo-600 rounded-full shadow-sm shadow-indigo-200" />
                    <span className="text-xs font-bold text-slate-700">Active Devices ({devicesWithLocations.filter(d => d.location).length})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-slate-400 rounded-full" />
                    <span className="text-xs font-bold text-slate-400">Offline ({devicesWithLocations.filter(d => !d.location).length})</span>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-4 gap-4">
                {devicesWithLocations.map((device) => (
                  <div 
                    key={device.imei}
                    className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3"
                  >
                    <div className={`w-2 h-2 rounded-full ${device.location ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{device.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono truncate">{device.imei}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-6xl mx-auto px-6 py-12 border-t border-slate-200/60 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3 opacity-50">
          <Smartphone className="w-5 h-5" />
          <span className="font-bold text-sm tracking-tight">IMEI Finder</span>
        </div>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em]">
          © 2024 Secure Device Recovery System
        </p>
        <div className="flex gap-6">
          <a href="#" className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors uppercase tracking-widest">Privacy</a>
          <a href="#" className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors uppercase tracking-widest">Terms</a>
        </div>
      </footer>
    </div>
  );
}
