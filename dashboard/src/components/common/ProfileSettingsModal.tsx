import { useState, useEffect, useRef } from 'react';
import { getUserContactInfo, updateUserSettingsProfile, updateUserAuthCredentials } from '../../services/userService';
import { useAuth } from '../../hooks/useAuth';
import { Modal } from './Modal';
import { pushToast } from '../../hooks/useToast';
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
import { AccountSecurityControls } from '../settings/AccountSecurityControls';
import { NotificationPreferencesPanel } from '../settings/NotificationPreferencesPanel';
import { useNotificationContext } from '../../context/NotificationContext';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '../../services/notificationPreferenceService';

interface ProfileSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type TabType = 'Personal Detail' | 'Security' | 'Notification';

const CSC_API_KEY = import.meta.env.VITE_CSC_API_KEY || '';

export function ProfileSettingsModal({ open, onClose }: ProfileSettingsModalProps) {
  const { session, user } = useAuth();
  const {
    notificationPreferences,
    notificationPreferencesLoading,
    notificationPreferencesError,
    saveNotificationPreferences,
  } = useNotificationContext();

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

  const [notificationDraft, setNotificationDraft] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );

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
      const contactVal = await getUserContactInfo(userId);
      setPhone(contactVal);
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



    setAvatarUrl(localStorage.getItem(`custom_avatar_${userId}`) || '');

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
    if (open && user) {
      loadSettings();
      setActiveTab('Personal Detail');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setNotificationDraft(notificationPreferences);
  }, [notificationPreferences]);

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

    if (activeTab === 'Notification') {
      setSubmitting(true);
      try {
        await saveNotificationPreferences(notificationDraft);
        pushToast({
          title: 'Notification preferences saved',
          description: 'Your notification presentation settings have been updated.',
          tone: 'success',
        });
      } catch (err: unknown) {
        pushToast({
          title: 'Update failed',
          description: err instanceof Error ? err.message : 'Please try again.',
          tone: 'error',
        });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!validate() || !session?.id) return;

    setSubmitting(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const userId = session.id;

      // 1. Update Supabase Auth profile
      const authEmailState = await updateUserAuthCredentials({
        email: email !== user?.email ? email.trim() : undefined,
        password: password || undefined,
        fullName
      });

      // 2. Synchronize with public.users table
      await updateUserSettingsProfile(userId, {
        fullName,
        phone
      });

      // 3. Save mocked fields to localStorage
      localStorage.setItem(`lang_${userId}`, preferredLanguage);
      localStorage.setItem(`country_${userId}`, country);
      localStorage.setItem(`province_${userId}`, province);
      localStorage.setItem(`city_${userId}`, city);
      localStorage.setItem(`zip_${userId}`, zipCode);


      if (avatarUrl) {
        localStorage.setItem(`custom_avatar_${userId}`, avatarUrl);
      } else {
        localStorage.removeItem(`custom_avatar_${userId}`);
      }

      // Dispatch custom events to notify useAuth to update current session state
      window.dispatchEvent(new Event('avatar-updated'));
      window.dispatchEvent(new Event('profile-updated'));

      pushToast(authEmailState.pendingEmail ? {
        title: 'Confirmation required',
        description: `We sent a confirmation link to ${authEmailState.pendingEmail}. Your current login email will remain ${authEmailState.currentEmail} until the new address is confirmed.`,
        tone: 'info',
      } : {
        title: 'Settings saved successfully',
        description: 'Your profile and credentials have been updated.',
        tone: 'success'
      });
      onClose();
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
    if (activeTab === 'Notification') {
      setNotificationDraft(notificationPreferences);
    } else {
      loadSettings();
    }
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
    <Modal
      open={open}
      onClose={onClose}
      title="Setting"
      subtitle="Manage your personal details and account credentials"
      size="2xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col max-h-[80vh] -mx-5 -my-5 font-[Geist,sans-serif] bg-white">
        {/* Top Tab Bar & Actions Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-3 border-b border-border sticky top-0 bg-white z-10 shrink-0">
          <div className="flex flex-wrap gap-1 p-1 bg-panel-bg border border-border rounded-xl">
            {(['Personal Detail', 'Security', 'Notification'] as const).map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition duration-150 cursor-pointer ${
                    active
                      ? 'bg-white text-foreground border border-border shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/50'
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
              className="px-3.5 py-1.5 border border-border bg-white hover:bg-panel-bg text-muted-foreground hover:text-foreground rounded-lg text-xs font-bold transition duration-200 cursor-pointer shadow-xs"
            >
              Reset All
            </button>
            <button
              type="submit"
              disabled={submitting || (activeTab === 'Notification' && notificationPreferencesLoading)}
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

        {/* Scrollable Contents Area */}
        <div className="flex-1 overflow-y-auto px-5 py-5 bg-panel-bg/30 space-y-6">
          {activeTab === 'Personal Detail' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Left Column Forms */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Personal Detail Block */}
                <div className="bg-white border border-border rounded-2xl p-5 shadow-xs">
                  <h3 className="text-sm font-bold text-foreground mb-0.5">Personal Detail</h3>
                  <p className="text-xs text-muted-foreground mb-4">Update your profile details to keep your account information up to date.</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">
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
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">
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
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">
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
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">
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
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">
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
                        <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">
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
                        <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">
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
                            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
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
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">
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
                            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
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
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">
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
                <div className="bg-white border border-border rounded-2xl p-5 shadow-xs flex flex-col">
                  <h3 className="text-sm font-bold text-foreground mb-0.5">Profile Photo</h3>
                  <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
                    Upload a clear profile image to personalize your workspace and team collaboration.
                  </p>

                  {/* Circle image container with Red trash button */}
                  <div className="flex justify-center mb-5">
                    <div className="relative group">
                      <img
                        src={avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(firstName || 'mkb')}`}
                        alt="Avatar Preview"
                        className="w-32 h-32 rounded-full object-cover bg-white border border-border p-1.5 shadow-sm ring-4 ring-[#1b3d32]/5 group-hover:ring-[#1b3d32]/10 transition-all duration-200"
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
                  <h4 className="text-[11px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Upload New Photo</h4>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center min-h-[140px] ${
                      dragOver 
                        ? 'border-[#1b3d32] bg-[#1b3d32]/5' 
                        : 'border-border hover:border-[#1b3d32]/40 bg-panel-bg/40 hover:bg-panel-bg/80'
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
                    <p className="text-xs text-foreground font-medium mb-1">
                      Drop your images here, or <span className="text-[#1b3d32] hover:underline font-bold">Click to browse</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">Upload File, .PNG/.JPG format (Max 2MB)</p>
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
                <div className="bg-white border border-border rounded-2xl p-5 shadow-xs">
                  <h3 className="text-sm font-bold text-foreground mb-0.5 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-primary" />
                    <span>Email Address</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4">Modify your primary log in email address.</p>
                  
                  <div>
                    <label className="block text-[11px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">
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
                <div className="bg-white border border-border rounded-2xl p-5 shadow-xs space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-foreground mb-0.5 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-primary" />
                      <span>Change Password</span>
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">Enter a new password. Minimum length is 8 characters.</p>
                  </div>

                  <div className="p-3 bg-accent border border-primary/20 text-accent-foreground rounded-xl flex items-start gap-2.5 shadow-xs">
                    <AlertTriangle className="w-4.5 h-4.5 text-primary shrink-0 mt-0.5" />
                    <p className="text-[11px] leading-relaxed font-medium">
                      Leave password fields blank if you do not want to modify your current credentials.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">
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
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password}</p>}
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">
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
                
                <AccountSecurityControls />

                {/* Delete Account Card */}
                <div className="bg-red-50/20 border border-red-200/50 rounded-2xl p-5 shadow-xs space-y-3">
                  <h3 className="text-xs font-bold text-red-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-red-700" />
                    <span>Danger Zone</span>
                  </h3>
                  <p className="text-[11px] text-red-700/80 leading-relaxed">
                    Account deletion is handled by an administrator to protect operational records.
                  </p>
                  <button
                    type="button"
                    disabled
                    title="Contact an administrator"
                    className="w-full py-2 bg-red-100 text-red-700 rounded-xl text-xs font-bold cursor-not-allowed opacity-80"
                  >
                    Delete Account — Contact administrator
                  </button>
                </div>

              </div>
            </div>
          )}

          {activeTab === 'Notification' && session && (
            <div className="animate-fade-in">
              <NotificationPreferencesPanel
                role={session.role}
                value={notificationDraft}
                loading={notificationPreferencesLoading}
                error={notificationPreferencesError}
                onChange={setNotificationDraft}
              />
            </div>
          )}
        </div>
      </form>

    </Modal>
  );
}
