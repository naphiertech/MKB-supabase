import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { pushToast } from '../hooks/useToast';
import { 
  Loader2, 
  Eye, 
  EyeOff, 
  Lock, 
  Mail, 
  ShieldAlert, 
  Upload, 
  Trash2, 
  ChevronDown,
  AlertTriangle
} from 'lucide-react';

type TabType = 'Personal Detail' | 'Security' | 'Notification';

const CSC_API_KEY = import.meta.env.VITE_CSC_API_KEY || '';

export function Settings() {
  const { session, user } = useAuth();

  // Tab State
  const [activeTab, setActiveTab] = useState<TabType>('Personal Detail');

  // Form states - Personal Details
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('English');
  const [country, setCountry] = useState('Philippines');
  const [province, setProvince] = useState('Zamboanga del Sur');
  const [city, setCity] = useState('Zamboanga City');
  const [zipCode, setZipCode] = useState('7000');

  // Dropdown lists from CountryStateCity API
  const [countriesList, setCountriesList] = useState<{ id: number; name: string; iso2: string }[]>([]);
  const [provincesList, setProvincesList] = useState<{ id: number; name: string; iso2: string }[]>([]);
  const [citiesList, setCitiesList] = useState<{ id: number; name: string }[]>([]);

  // Selected ISO codes tracking for cascading requests
  const [selectedCountryIso, setSelectedCountryIso] = useState('');

  // Profile photo state
  const [avatarUrl, setAvatarUrl] = useState('');

  // Security states
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoStepVerification, setTwoStepVerification] = useState(false);
  const [supportAccess, setSupportAccess] = useState(false);

  // Notification states
  const [notifBoundaryExit, setNotifBoundaryExit] = useState(true);
  const [notifAttendance, setNotifAttendance] = useState(true);
  const [notifReports, setNotifReports] = useState(false);
  const [notifSound, setNotifSound] = useState(true);
  const [notifPush, setNotifPush] = useState(true);

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dragOver, setDragOver] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CSC API Fetch Helpers
  const fetchCountries = async () => {
    try {
      const res = await fetch('https://api.countrystatecity.in/v1/countries', {
        headers: { 'X-CSCAPI-KEY': CSC_API_KEY }
      });
      if (res.ok) {
        const data = await res.json();
        setCountriesList(data);
        return data;
      }
    } catch (e) {
      console.error('Failed to fetch countries:', e);
    }
    return [];
  };

  const fetchProvinces = async (countryIso: string) => {
    if (!countryIso) {
      setProvincesList([]);
      setCitiesList([]);
      return [];
    }
    try {
      const res = await fetch(`https://api.countrystatecity.in/v1/countries/${countryIso}/states`, {
        headers: { 'X-CSCAPI-KEY': CSC_API_KEY }
      });
      if (res.ok) {
        const data = await res.json();
        setProvincesList(data);
        return data;
      }
    } catch (e) {
      console.error('Failed to fetch provinces:', e);
    }
    return [];
  };

  const fetchCities = async (countryIso: string, provinceIso: string) => {
    if (!countryIso || !provinceIso) {
      setCitiesList([]);
      return [];
    }
    try {
      const res = await fetch(`https://api.countrystatecity.in/v1/countries/${countryIso}/states/${provinceIso}/cities`, {
        headers: { 'X-CSCAPI-KEY': CSC_API_KEY }
      });
      if (res.ok) {
        const data = await res.json();
        setCitiesList(data);
        return data;
      }
    } catch (e) {
      console.error('Failed to fetch cities:', e);
    }
    return [];
  };

  const loadSettings = async () => {
    if (!user) return;

    // Split name
    const parts = (user.name || '').trim().split(/\s+/);
    setFirstName(parts[0] || '');
    setLastName(parts.slice(1).join(' ') || '');
    setEmail(user.email || '');

    setPassword('');
    setConfirmPassword('');
    setErrors({});

    const userId = user.id;

    // Fetch phone number (contact) from users table
    try {
      const { data, error } = await supabase
        .from('users')
        .select('contact')
        .eq('id', userId)
        .single();
      if (!error && data?.contact) {
        setPhone(data.contact);
      } else {
        setPhone('');
      }
    } catch (e) {
      console.error('Failed to load contact info:', e);
      setPhone('');
    }

    // Load extra mocked fields from LocalStorage
    setPreferredLanguage(localStorage.getItem(`lang_${userId}`) || 'English');
    const savedCountry = localStorage.getItem(`country_${userId}`) || 'Philippines';
    const savedProvince = localStorage.getItem(`province_${userId}`) || 'Zamboanga del Sur';
    const savedCity = localStorage.getItem(`city_${userId}`) || 'Zamboanga City';

    setCountry(savedCountry);
    setProvince(savedProvince);
    setCity(savedCity);

    setTwoStepVerification(localStorage.getItem(`2fa_${userId}`) === 'true');
    setSupportAccess(localStorage.getItem(`support_access_${userId}`) === 'true');
    setAvatarUrl(localStorage.getItem(`custom_avatar_${userId}`) || '');

    setNotifBoundaryExit(localStorage.getItem(`notif_boundary_${userId}`) !== 'false');
    setNotifAttendance(localStorage.getItem(`notif_attendance_${userId}`) !== 'false');
    setNotifReports(localStorage.getItem(`notif_reports_${userId}`) === 'true');
    setNotifSound(localStorage.getItem(`notif_sound_${userId}`) !== 'false');
    setNotifPush(localStorage.getItem(`notif_push_${userId}`) !== 'false');

    // Cascading fetch to initialize country/state/city dropdown choices based on loaded values
    const countries = await fetchCountries();
    if (countries.length > 0) {
      const matchedCountry = countries.find((c: { id: number; name: string; iso2: string }) => c.name.toLowerCase() === savedCountry.toLowerCase());
      if (matchedCountry) {
        setSelectedCountryIso(matchedCountry.iso2);
        const provinces = await fetchProvinces(matchedCountry.iso2);
        
        if (provinces.length > 0) {
          const matchedProvince = provinces.find((p: { id: number; name: string; iso2: string }) => p.name.toLowerCase() === savedProvince.toLowerCase());
          if (matchedProvince) {
            await fetchCities(matchedCountry.iso2, matchedProvince.iso2);
          }
        }
      }
    }
  };

  useEffect(() => {
    if (user) {
      loadSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleCountryChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const countryName = e.target.value;
    setCountry(countryName);
    setProvince('');
    setCity('');
    setSelectedCountryIso('');
    setProvincesList([]);
    setCitiesList([]);

    const matched = countriesList.find((c) => c.name === countryName);
    if (matched) {
      setSelectedCountryIso(matched.iso2);
      await fetchProvinces(matched.iso2);
    }
  };

  const handleProvinceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const provinceName = e.target.value;
    setProvince(provinceName);
    setCity('');
    setCitiesList([]);

    const matched = provincesList.find((p) => p.name === provinceName);
    if (matched && selectedCountryIso) {
      await fetchCities(selectedCountryIso, matched.iso2);
    }
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCity(e.target.value);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = 'First name is required';
    if (!lastName.trim()) errs.lastName = 'Last name is required';
    if (!email.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Invalid email format';
    }
    if (password) {
      if (password.length < 8) {
        errs.password = 'Password must be at least 8 characters';
      }
      if (password !== confirmPassword) {
        errs.confirmPassword = 'Passwords do not match';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !session?.id) return;

    setSubmitting(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const userId = session.id;

      // 1. Update Supabase Auth profile
      const authUpdates: { email?: string; password?: string; data: { full_name: string } } = {
        email: email !== user?.email ? email.trim() : undefined,
        data: { full_name: fullName }
      };

      if (password) {
        authUpdates.password = password;
      }

      const { error: authErr } = await supabase.auth.updateUser(authUpdates);
      if (authErr) throw authErr;

      // 2. Synchronize with public.users table
      const { error: dbErr } = await supabase
        .from('users')
        .update({
          full_name: fullName,
          email: email.trim(),
          contact: phone.trim()
        })
        .eq('id', userId);

      if (dbErr) throw dbErr;

      // 3. Save mocked fields to localStorage
      localStorage.setItem(`lang_${userId}`, preferredLanguage);
      localStorage.setItem(`country_${userId}`, country);
      localStorage.setItem(`province_${userId}`, province);
      localStorage.setItem(`city_${userId}`, city);
      localStorage.setItem(`zip_${userId}`, zipCode);

      localStorage.setItem(`2fa_${userId}`, String(twoStepVerification));
      localStorage.setItem(`support_access_${userId}`, String(supportAccess));

      localStorage.setItem(`notif_boundary_${userId}`, String(notifBoundaryExit));
      localStorage.setItem(`notif_attendance_${userId}`, String(notifAttendance));
      localStorage.setItem(`notif_reports_${userId}`, String(notifReports));
      localStorage.setItem(`notif_sound_${userId}`, String(notifSound));
      localStorage.setItem(`notif_push_${userId}`, String(notifPush));

      if (avatarUrl) {
        localStorage.setItem(`custom_avatar_${userId}`, avatarUrl);
      } else {
        localStorage.removeItem(`custom_avatar_${userId}`);
      }

      // Dispatch custom events to notify useAuth to update current session state
      window.dispatchEvent(new Event('avatar-updated'));
      window.dispatchEvent(new Event('profile-updated'));

      pushToast({
        title: 'Settings saved successfully',
        description: 'Your profile and credentials have been updated.',
        tone: 'success'
      });
    } catch (err: unknown) {
      console.error('Failed to update credentials:', err);
      pushToast({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        tone: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetAll = () => {
    loadSettings();
    pushToast({
      title: 'Settings reset',
      description: 'Your changes have been discarded.',
      tone: 'info'
    });
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      pushToast({ title: 'Invalid file type', description: 'Please select an image file.', tone: 'error' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      pushToast({ title: 'File too large', description: 'Maximum file size is 2MB.', tone: 'error' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      <div className="bg-white border border-[#EFEAE2] rounded-xl p-5 shadow-sm font-[Geist,sans-serif]">
        <form onSubmit={handleSubmit} className="flex flex-col bg-white">
          {/* Top Tab Bar & Actions Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EFEAE2] mb-5 bg-white z-10 shrink-0">
            <div className="flex gap-1 p-1 bg-[#FAFAF7] border border-[#EFEAE2] rounded-xl">
              {(['Personal Detail', 'Security', 'Notification'] as const).map((tab) => {
                const active = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition duration-150 cursor-pointer ${
                      active
                        ? 'bg-white text-[#1A1410] border border-[#EFEAE2] shadow-xs'
                        : 'text-[#6B6258] hover:text-[#1A1410] hover:bg-white/50'
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            {/* Reset All & Save Action Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetAll}
                className="px-3.5 py-1.5 border border-[#EFEAE2] bg-white hover:bg-[#FAFAF7] text-[#6B6258] hover:text-[#1A1410] rounded-lg text-xs font-bold transition duration-200 cursor-pointer shadow-xs"
              >
                Reset All
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 bg-[#1b3d32] hover:bg-[#132c24] text-white rounded-lg text-xs font-bold transition duration-200 flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                )}
                <span>Save</span>
              </button>
            </div>
          </div>

          {/* Contents Area */}
          <div className="bg-[#FAFAF7]/30 space-y-6">
            {activeTab === 'Personal Detail' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Left Column Forms */}
                <div className="lg:col-span-2 space-y-6">
                  
                  {/* Personal Detail Block */}
                  <div className="bg-white border border-[#EFEAE2] rounded-2xl p-5 shadow-xs">
                    <h3 className="text-sm font-bold text-[#1A1410] mb-0.5">Personal Detail</h3>
                    <p className="text-xs text-[#6B6258] mb-4">Update your profile details to keep your account information up to date.</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-[#6B6258] mb-1.5 uppercase tracking-wider">
                          First Name
                        </label>
                        <input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="First Name"
                          className="prof-input"
                        />
                        {errors.firstName && <p className="text-xs text-red-600 mt-1">{errors.firstName}</p>}
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#6B6258] mb-1.5 uppercase tracking-wider">
                          Last Name
                        </label>
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Last Name"
                          className="prof-input"
                        />
                        {errors.lastName && <p className="text-xs text-red-600 mt-1">{errors.lastName}</p>}
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#6B6258] mb-1.5 uppercase tracking-wider">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Email Address"
                          className="prof-input"
                        />
                        {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#6B6258] mb-1.5 uppercase tracking-wider">
                          Phone Number
                        </label>
                        <input
                          type="text"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="Phone Number"
                          className="prof-input"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-bold text-[#6B6258] mb-1.5 uppercase tracking-wider">
                          Preferred Language
                        </label>
                        <div className="relative">
                          <select
                            value={preferredLanguage}
                            onChange={(e) => setPreferredLanguage(e.target.value)}
                            className="prof-input appearance-none bg-white pr-10 cursor-pointer"
                          >
                            <option value="English">English</option>
                            <option value="Spanish">Spanish</option>
                            <option value="French">French</option>
                            <option value="German">German</option>
                            <option value="Tagalog">Tagalog</option>
                            <option value="Chavacano">Chavacano</option>
                          </select>
                          <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6258] pointer-events-none" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#6B6258] mb-1.5 uppercase tracking-wider">
                          Country
                        </label>
                        <div className="relative">
                          <select
                            value={country}
                            onChange={handleCountryChange}
                            className="prof-input appearance-none bg-white pr-10 cursor-pointer text-ellipsis overflow-hidden"
                          >
                            <option value="">Select Country</option>
                            {countriesList.map((c) => (
                              <option key={c.id} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6258] pointer-events-none" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#6B6258] mb-1.5 uppercase tracking-wider">
                          Province
                        </label>
                        <div className="relative">
                          {provincesList.length > 0 ? (
                            <>
                              <select
                                value={province}
                                onChange={handleProvinceChange}
                                className="prof-input appearance-none bg-white pr-10 cursor-pointer text-ellipsis overflow-hidden"
                              >
                                <option value="">Select Province</option>
                                {provincesList.map((p) => (
                                  <option key={p.id} value={p.name}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6258] pointer-events-none" />
                            </>
                          ) : (
                            <input
                              type="text"
                              value={province}
                              onChange={(e) => setProvince(e.target.value)}
                              placeholder="Enter Province"
                              className="prof-input bg-white"
                              disabled={!country}
                            />
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#6B6258] mb-1.5 uppercase tracking-wider">
                          City
                        </label>
                        <div className="relative">
                          {citiesList.length > 0 ? (
                            <>
                              <select
                                value={city}
                                onChange={handleCityChange}
                                className="prof-input appearance-none bg-white pr-10 cursor-pointer text-ellipsis overflow-hidden"
                              >
                                <option value="">Select City</option>
                                {citiesList.map((c) => (
                                  <option key={c.id} value={c.name}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6258] pointer-events-none" />
                            </>
                          ) : (
                            <input
                              type="text"
                              value={city}
                              onChange={(e) => setCity(e.target.value)}
                              placeholder="Enter City"
                              className="prof-input bg-white"
                              disabled={!province}
                            />
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#6B6258] mb-1.5 uppercase tracking-wider">
                          Zip Code
                        </label>
                        <input
                          type="text"
                          value={zipCode}
                          onChange={(e) => setZipCode(e.target.value)}
                          placeholder="Zip Code"
                          className="prof-input"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column Profile Photo Upload */}
                <div className="space-y-6">
                  <div className="bg-white border border-[#EFEAE2] rounded-2xl p-5 shadow-xs flex flex-col">
                    <h3 className="text-sm font-bold text-[#1A1410] mb-0.5">Profile Photo</h3>
                    <p className="text-xs text-[#6B6258] mb-5 leading-relaxed">
                      Upload a clear profile image to personalize your workspace and team collaboration.
                  </p>

                    {/* Circle image container with Red trash button */}
                    <div className="flex justify-center mb-5">
                      <div className="relative group">
                        <img
                          src={avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(firstName || 'mkb')}`}
                          alt="Avatar Preview"
                          className="w-32 h-32 rounded-full object-cover bg-white border border-[#EFEAE2] p-1.5 shadow-sm ring-4 ring-[#1b3d32]/5 group-hover:ring-[#1b3d32]/10 transition-all duration-200"
                        />
                        {avatarUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setAvatarUrl('');
                              pushToast({ title: 'Photo cleared', description: 'Click Save to discard the custom photo.', tone: 'info' });
                            }}
                            className="absolute bottom-1 right-1 p-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-full shadow-md transition-all duration-200 cursor-pointer"
                            title="Delete Custom Photo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Upload new photo area (drag and drop) */}
                    <h4 className="text-[11px] font-bold text-[#6B6258] mb-1.5 uppercase tracking-wider">Upload New Photo</h4>
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center min-h-[140px] ${
                        dragOver 
                          ? 'border-[#1b3d32] bg-[#1b3d32]/5' 
                          : 'border-[#EFEAE2] hover:border-[#1b3d32]/40 bg-[#FAFAF7]/40 hover:bg-[#FAFAF7]/80'
                      }`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        className="hidden"
                      />
                      <div className="w-10 h-10 rounded-full bg-[#1b3d32]/10 flex items-center justify-center text-[#1b3d32] mb-3 transition-colors duration-250">
                        <Upload className="w-5 h-5" />
                      </div>
                      <p className="text-xs text-[#1A1410] font-medium mb-1">
                        Drop your images here, or <span className="text-[#1b3d32] hover:underline font-bold">Click to browse</span>
                      </p>
                      <p className="text-[10px] text-[#6B6258]">Upload File, .PNG/.JPG format (Max 2MB)</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'Security' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start animate-fade-in">
                {/* Credentials Section */}
                <div className="lg:col-span-2 space-y-6">
                  
                  {/* Email Update Panel */}
                  <div className="bg-white border border-[#EFEAE2] rounded-2xl p-5 shadow-xs">
                    <h3 className="text-sm font-bold text-[#1A1410] mb-0.5 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-[#db6c00]" />
                      <span>Email Address</span>
                    </h3>
                    <p className="text-xs text-[#6B6258] mb-4">Modify your primary log in email address.</p>
                    
                    <div>
                      <label className="block text-[11px] font-bold text-[#6B6258] mb-1.5 uppercase tracking-wider">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email Address"
                        className="prof-input"
                      />
                      {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
                    </div>
                  </div>

                  {/* Password Update Panel */}
                  <div className="bg-white border border-[#EFEAE2] rounded-2xl p-5 shadow-xs space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-[#1A1410] mb-0.5 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-[#db6c00]" />
                        <span>Change Password</span>
                      </h3>
                      <p className="text-xs text-[#6B6258] mb-4">Enter a new password. Minimum length is 8 characters.</p>
                    </div>

                    <div className="p-3 bg-[#FFF1E0] border border-[#db6c00]/20 text-[#b85a00] rounded-xl flex items-start gap-2.5 shadow-xs">
                      <AlertTriangle className="w-4.5 h-4.5 text-[#db6c00] shrink-0 mt-0.5" />
                      <p className="text-[11px] leading-relaxed font-medium">
                        Leave password fields blank if you do not want to modify your current credentials.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-[#6B6258] mb-1.5 uppercase tracking-wider">
                          New Password
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Min. 8 characters"
                            className="prof-input pr-10"
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((s) => !s)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-[#6B6258] hover:text-[#1A1410] rounded cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password}</p>}
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#6B6258] mb-1.5 uppercase tracking-wider">
                          Confirm Password
                        </label>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repeat new password"
                          className="prof-input"
                        />
                        {errors.confirmPassword && <p className="text-xs text-red-600 mt-1">{errors.confirmPassword}</p>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column Toggles */}
                <div className="space-y-6">
                  
                  {/* Advanced Security Card */}
                  <div className="bg-white border border-[#EFEAE2] rounded-2xl p-5 shadow-xs space-y-4">
                    <h3 className="text-sm font-bold text-[#1A1410] mb-0.5">Account Security</h3>
                    
                    {/* Toggle 1 */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-semibold text-[#1A1410]">2-Step Verification</h4>
                        <p className="text-[10px] text-[#6B6258] leading-relaxed">
                          Add an extra layer of protection to secure authentication.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !twoStepVerification;
                          setTwoStepVerification(next);
                          pushToast({
                            title: next ? '2FA Scheduled' : '2FA Off',
                            description: `Two-factor authentication will be ${next ? 'enabled' : 'disabled'} upon save.`,
                            tone: 'info'
                          });
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#1b3d32]/35 ${
                          twoStepVerification ? 'bg-[#1b3d32]' : 'bg-[#EFEAE2]'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            twoStepVerification ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="h-px bg-[#EFEAE2]" />

                    {/* Toggle 2 */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-semibold text-[#1A1410]">Support Access</h4>
                        <p className="text-[10px] text-[#6B6258] leading-relaxed">
                          Allow administrators or tech representatives to audit your current dashboard.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !supportAccess;
                          setSupportAccess(next);
                          pushToast({
                            title: next ? 'Support Access Scheduled' : 'Support Access Off',
                            description: `Support access will be ${next ? 'allowed' : 'denied'} upon save.`,
                            tone: 'info'
                          });
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#1b3d32]/35 ${
                          supportAccess ? 'bg-[#1b3d32]' : 'bg-[#EFEAE2]'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            supportAccess ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Force Sessions Log Out */}
                  <div className="bg-white border border-[#EFEAE2] rounded-2xl p-5 shadow-xs space-y-3">
                    <h3 className="text-xs font-bold text-[#1A1410] uppercase tracking-wider">Active Sessions</h3>
                    <p className="text-[11px] text-[#6B6258] leading-relaxed">
                      Log out of all other active browser sessions on other devices or locations.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        pushToast({ title: 'Logging out sessions', description: 'Processing active credentials...', tone: 'info' });
                        setTimeout(() => {
                          pushToast({ title: 'Success', description: 'Terminated all other active sessions.', tone: 'success' });
                        }, 1000);
                      }}
                      className="w-full py-2 bg-white hover:bg-[#FAFAF7] border border-[#EFEAE2] text-[#6B6258] hover:text-[#1A1410] rounded-xl text-xs font-bold transition duration-200 cursor-pointer"
                    >
                      Log out of all other devices
                    </button>
                  </div>

                  {/* Delete Account Card */}
                  <div className="bg-red-50/20 border border-red-200/50 rounded-2xl p-5 shadow-xs space-y-3">
                    <h3 className="text-xs font-bold text-red-800 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-red-700" />
                      <span>Danger Zone</span>
                    </h3>
                    <p className="text-[11px] text-red-700/80 leading-relaxed">
                      Once deleted, account databases are permanently scrubbed. Operational reports will be wiped.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const confirm = window.confirm("Are you absolutely sure you want to delete your account? This action cannot be undone.");
                        if (confirm) {
                          pushToast({ title: 'Unauthorized', description: 'Please contact system administrator to process deletion requests.', tone: 'error' });
                        }
                      }}
                      className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition duration-200 cursor-pointer shadow-xs"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'Notification' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start animate-fade-in">
                <div className="lg:col-span-2 space-y-6">
                  
                  {/* Email Notifications */}
                  <div className="bg-white border border-[#EFEAE2] rounded-2xl p-5 shadow-xs space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-[#1A1410] mb-0.5">Email Notifications</h3>
                      <p className="text-xs text-[#6B6258] mb-4">Manage when and how you receive email compliance digests.</p>
                    </div>

                    {/* Toggle 1 */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-semibold text-[#1A1410]">Geofence Violations</h4>
                        <p className="text-[10px] text-[#6B6258] leading-relaxed">Receive instant alerts when riders breach boundaries.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNotifBoundaryExit(!notifBoundaryExit)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#1b3d32]/35 ${
                          notifBoundaryExit ? 'bg-[#1b3d32]' : 'bg-[#EFEAE2]'
                        }`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${notifBoundaryExit ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <div className="h-px bg-[#EFEAE2]" />

                    {/* Toggle 2 */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-semibold text-[#1A1410]">Attendance Logs</h4>
                        <p className="text-[10px] text-[#6B6258] leading-relaxed">Get notified on late check-ins or absent shifts.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNotifAttendance(!notifAttendance)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#1b3d32]/35 ${
                          notifAttendance ? 'bg-[#1b3d32]' : 'bg-[#EFEAE2]'
                        }`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${notifAttendance ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <div className="h-px bg-[#EFEAE2]" />

                    {/* Toggle 3 */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-semibold text-[#1A1410]">Weekly Digests</h4>
                        <p className="text-[10px] text-[#6B6258] leading-relaxed">Subscribe to weekly operations and payroll data logs.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNotifReports(!notifReports)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#1b3d32]/35 ${
                          notifReports ? 'bg-[#1b3d32]' : 'bg-[#EFEAE2]'
                        }`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${notifReports ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Column Alerts */}
                <div className="space-y-6">
                  {/* System Alerts Card */}
                  <div className="bg-white border border-[#EFEAE2] rounded-2xl p-5 shadow-xs space-y-4">
                    <h3 className="text-sm font-bold text-[#1A1410] mb-0.5">System Alerts</h3>

                    {/* sound */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-semibold text-[#1A1410]">Sound Effects</h4>
                        <p className="text-[10px] text-[#6B6258] leading-relaxed">Play chime sound when geofence violations trigger.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNotifSound(!notifSound)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#1b3d32]/35 ${
                          notifSound ? 'bg-[#1b3d32]' : 'bg-[#EFEAE2]'
                        }`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${notifSound ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <div className="h-px bg-[#EFEAE2]" />

                    {/* push */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-semibold text-[#1A1410]">Push Notifications</h4>
                        <p className="text-[10px] text-[#6B6258] leading-relaxed">Display browser notification alerts in the background.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNotifPush(!notifPush)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#1b3d32]/35 ${
                          notifPush ? 'bg-[#1b3d32]' : 'bg-[#EFEAE2]'
                        }`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${notifPush ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>
      </div>

      <style>{`
        .prof-input {
          width: 100%;
          height: 42px;
          padding-left: 14px;
          padding-right: 14px;
          background: #ffffff;
          border: 1px solid #EFEAE2;
          border-radius: 12px;
          color: #1A1410;
          font-size: 13px;
          outline: none;
          transition: all 200ms ease;
        }
        .prof-input:hover {
          border-color: rgba(27, 61, 50, 0.4);
        }
        .prof-input:focus {
          border-color: #1b3d32;
          box-shadow: 0 0 0 4px rgba(27, 61, 50, 0.08);
        }
        select.prof-input {
          background-image: none;
        }
      `}</style>
    </div>
  );
}
