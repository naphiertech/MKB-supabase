import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAllRiders } from '../services/monitoringService';
import { getZones } from '../services/geofenceService';
import type { Rider, Zone } from '../services/types';
import { useAuth } from '../hooks/useAuth';

interface RiderZoneContextType {
  riders: Rider[];
  zones: Zone[];
  isLoading: boolean;
  refreshData: () => Promise<void>;
}

const RiderZoneContext = createContext<RiderZoneContextType | undefined>(undefined);

export const RiderZoneProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const [riders, setRiders] = useState<Rider[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = async () => {
    if (!session) return;
    setIsLoading(true);
    try {
      const [rData, zData] = await Promise.all([getAllRiders(), getZones()]);
      setRiders(rData);
      setZones(zData);
    } catch (err) {
      console.error('[RiderZoneContext] Error fetching riders and zones:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      fetchData();
    } else {
      setRiders([]);
      setZones([]);
    }
  }, [session]);

  return (
    <RiderZoneContext.Provider value={{ riders, zones, isLoading, refreshData: fetchData }}>
      {children}
    </RiderZoneContext.Provider>
  );
};

export const useRiderZone = () => {
  const context = useContext(RiderZoneContext);
  if (!context) {
    throw new Error('useRiderZone must be used within a RiderZoneProvider');
  }
  return context;
};
