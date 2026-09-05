import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Lock,
  History,
  Building2,
  Calendar,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Check,
  Search,
  ChevronLeft,
  ChevronRight,
  Coins,
  XCircle,
} from 'lucide-react';
import { appToast } from '../hooks/useToast';
import { useHub } from '../context/HubContext';
import {
  parseFmsFleetOverviewXlsx,
  FmsParseResult,
} from '../services/fms/fmsParser';
import {
  stageFmsImportBatch,
  cancelFmsImportBatch,
  confirmFmsDailyRiderObservation,
  getFmsBatchObservations,
  getFmsImportBatchById,
  listFmsImportBatches,
  resolveBatchResumeStep,
  groupBatchesByDate,
  FmsImportBatch,
  FmsObservationViewItem,
} from '../services/fms/fmsImportService';
import {
  listExternalRiderMappings,
  saveExternalRiderMapping,
  ExternalRiderMapping,
} from '../services/fms/externalRiderMappingService';
import {
  getParcelRateContextForDate,
  resolveRateTierInfo,
  type ParcelRateContext,
} from '../services/parcels/parcelOperationsPolicy';
import { supabase } from '../lib/supabaseClient';
import { PAGE_TRANSITION_VARIANTS } from '../lib/motion';

function getUrlBatchId(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('batchId');
}

function setUrlBatchId(batchId: string | null) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (batchId) {
    url.searchParams.set('batchId', batchId);
  } else {
    url.searchParams.delete('batchId');
  }
  window.history.replaceState({}, '', url.toString());
}

export function FMSDailyImport() {
  const { selectedHubId, hubs } = useHub();

  // Workflow steps: 1. Upload, 2. Validate, 3. Map Riders, 4. Classify, 5. Review, 6. Confirm
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Business Date (Asia/Manila format YYYY-MM-DD)
  const [businessDate, setBusinessDate] = useState<string>(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  });

  // Selected Hub for the batch
  const [targetHubId, setTargetHubId] = useState<string>(() => {
    return selectedHubId || (hubs.length > 0 ? hubs[0].id : '');
  });

  useEffect(() => {
    if (selectedHubId) {
      setTargetHubId(selectedHubId);
    } else if (!targetHubId && hubs.length > 0) {
      setTargetHubId(hubs[0].id);
    }
  }, [selectedHubId, hubs, targetHubId]);

  // File and Parsed State (Pre-staging)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseResult, setParseResult] = useState<FmsParseResult | null>(null);

  // Active Batch Entity State (Post-staging)
  const [activeBatch, setActiveBatch] = useState<FmsImportBatch | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);

  // Drag & drop highlight state
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Mappings and Hub Riders
  const [mappings, setMappings] = useState<Record<string, ExternalRiderMapping>>({});
  const [hubRiders, setHubRiders] = useState<Array<{ id: string; name: string; mkb_id: string; hub_id: string }>>([]);
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, string>>({}); // driver_id -> rider_id
  const [rememberMapping, setRememberMapping] = useState<Record<string, boolean>>({});

  // Step 3 (Map Riders) Search, Filter, Pagination state
  const [mapSearch, setMapSearch] = useState<string>('');
  const [mapFilter, setMapFilter] = useState<'all' | 'needs_mapping' | 'matched'>('all');
  const [mapPage, setMapPage] = useState<number>(1);
  const mapPageSize = 25;

  // Business date and Hub authority: post-staging, activeBatch is canonical.
  const effectiveBusinessDate = activeBatch?.business_date || businessDate;
  const effectiveHubId = activeBatch?.hub_id || targetHubId;

  // Rate Context for the effective business date
  const [rateContext, setRateContext] = useState<ParcelRateContext | null>(null);

  useEffect(() => {
    getParcelRateContextForDate(effectiveBusinessDate)
      .then(setRateContext)
      .catch((err) => console.warn('Could not load parcel rate context for date:', err));
  }, [effectiveBusinessDate]);

  // Observations State (for Classify, Review & Confirm)
  const [observations, setObservations] = useState<FmsObservationViewItem[]>([]);
  const [isLoadingObs, setIsLoadingObs] = useState<boolean>(false);

  // Classification Inputs: observationId -> { heavy: number, failed: number, returned: number }
  const [classifications, setClassifications] = useState<
    Record<string, { heavy: number; failed: number; returned: number }>
  >({});

  // Confirmation in-flight state
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set());
  const [isBulkConfirming, setIsBulkConfirming] = useState<boolean>(false);

  // Recent batches history and date-group expansion
  const [recentBatches, setRecentBatches] = useState<FmsImportBatch[]>([]);
  const [expandedDateKey, setExpandedDateKey] = useState<string | null>(null);

  // Read-only status for confirmed or cancelled batches
  const isReadOnly = useMemo(() => {
    return activeBatch?.status === 'confirmed' || activeBatch?.status === 'cancelled';
  }, [activeBatch]);

  // Current Hub object for display
  const currentHub = useMemo(() => {
    return hubs.find((h) => h.id === effectiveHubId) || null;
  }, [hubs, effectiveHubId]);

  // Hub mismatch detection during Step 2 (Validate)
  const hubMismatches = useMemo(() => {
    if (!parseResult || !targetHubId) return [];
    const mismatches: Array<{
      driverId: string;
      driverName: string;
      riderName: string;
      riderMkbId: string | null;
      riderHubId: string | null;
      riderHubName: string;
      targetHubName: string;
    }> = [];

    parseResult.rows.forEach((row) => {
      const mapping = mappings[row.external_driver_id];
      if (mapping?.rider?.hub_id && mapping.rider.hub_id !== targetHubId) {
        const riderHub = hubs.find((h) => h.id === mapping.rider!.hub_id);
        mismatches.push({
          driverId: row.external_driver_id,
          driverName: row.external_driver_name || mapping.external_display_name || row.external_driver_id,
          riderName: mapping.rider.name,
          riderMkbId: mapping.rider.mkb_id,
          riderHubId: mapping.rider.hub_id,
          riderHubName: riderHub?.name || 'Another Hub',
          targetHubName: currentHub?.name || 'Selected Hub',
        });
      }
    });

    return mismatches;
  }, [parseResult, targetHubId, mappings, hubs, currentHub]);

  // Cancellation State & Authority
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  const isCancellable = useMemo(() => {
    return (
      activeBatch !== null &&
      activeBatch.status === 'staged' &&
      observations.every((o) => o.confirmation_status === 'staged' && !o.parcel_log_id)
    );
  }, [activeBatch, observations]);

  // Load mappings and hub riders on mount or hub change
  const loadReferenceData = useCallback(async () => {
    try {
      const mappingMap = await listExternalRiderMappings('spx_fms');
      setMappings(mappingMap);

      let ridersQuery = supabase
        .from('riders')
        .select('id, name, mkb_id, hub_id')
        .neq('status', 'archived');

      if (effectiveHubId) {
        ridersQuery = ridersQuery.eq('hub_id', effectiveHubId);
      }

      const { data: rData } = await ridersQuery.order('name', { ascending: true });
      setHubRiders(rData || []);

      const batches = await listFmsImportBatches(effectiveHubId || undefined);
      setRecentBatches(batches.slice(0, 5));
    } catch (err) {
      console.error('Error loading reference data:', err);
    }
  }, [effectiveHubId]);

  useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  // Handle Safe Batch Cancellation
  const handleCancelBatch = async () => {
    if (!activeBatchId) return;
    setIsCancelling(true);
    try {
      await cancelFmsImportBatch(activeBatchId);
      appToast.success('Import batch cancelled.');
      setIsCancelModalOpen(false);
      handleStartNewImport();
      await loadReferenceData();
    } catch (err: any) {
      console.error('Error cancelling batch:', err);
      appToast.error(err.message || 'Failed to cancel staged batch.');
    } finally {
      setIsCancelling(false);
    }
  };

  // Process File Buffer
  const processSelectedFile = async (file: File) => {
    if (!targetHubId) {
      appToast.error('Please select an operational Hub workspace first.');
      return;
    }

    setSelectedFile(file);
    setIsParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const result = await parseFmsFleetOverviewXlsx(buffer, {
        expectedBusinessDate: businessDate,
      });

      setParseResult(result);
      appToast.success(`Parsed ${result.rowCount} driver rows.`);
      setCurrentStep(2); // Move to Validate step
    } catch (err: any) {
      console.error('Parsing error:', err);
      appToast.error(err.message || 'Failed to parse delivery file.');
      setSelectedFile(null);
      setParseResult(null);
    } finally {
      setIsParsing(false);
    }
  };

  // Handle File Input Change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processSelectedFile(file);
    }
  };

  // Handle Drag & Drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processSelectedFile(file);
    }
  };

  // Stage batch to Postgres
  const handleStageBatch = async () => {
    if (!parseResult || !selectedFile || !targetHubId) return;

    setIsParsing(true);
    try {
      const res = await stageFmsImportBatch({
        businessDate,
        filename: selectedFile.name,
        fileSha256: parseResult.sha256,
        hubId: targetHubId,
        sourceRowCount: parseResult.rowCount,
        observations: parseResult.rows,
      });

      const batch = await getFmsImportBatchById(res.batchId);
      if (batch) {
        setActiveBatch(batch);
        setBusinessDate(batch.business_date);
        setTargetHubId(batch.hub_id);
      }
      setActiveBatchId(res.batchId);
      setUrlBatchId(res.batchId);

      if (res.isExisting) {
        appToast.info('This delivery file was previously staged. Loaded existing batch.');
      } else {
        appToast.success('Batch staged successfully.');
      }

      const batchDate = batch?.business_date || res.businessDate || businessDate;

      // Check if unmapped riders exist
      const unmapped = parseResult.rows.filter((r) => !mappings[r.external_driver_id]);
      if (unmapped.length > 0) {
        setCurrentStep(3); // Map Riders
      } else {
        // All mapped, load observations and go to Classify
        await loadBatchObservations(res.batchId, batchDate);
        setCurrentStep(4);
      }
    } catch (err: any) {
      console.error('Staging error:', err);
      appToast.error(err.message || 'Failed to stage delivery batch.');
    } finally {
      setIsParsing(false);
    }
  };

  // Load batch observations from database
  const loadBatchObservations = useCallback(
    async (batchId: string, overrideDate?: string) => {
      setIsLoadingObs(true);
      try {
        const targetDate = overrideDate || activeBatch?.business_date || businessDate;
        const obsList = await getFmsBatchObservations(batchId, targetDate);
        setObservations(obsList);

        // Initialize classifications draft
        const initClass: Record<string, { heavy: number; failed: number; returned: number }> = {};
        obsList.forEach((obs) => {
          const prevHeavy = obs.confirmed_heavy_delivered ?? obs.existingParcelLog?.heavy_parcels ?? 0;
          const prevFailed = obs.confirmed_failed ?? obs.failed_delivery ?? 0;
          const prevReturned = obs.confirmed_returned ?? obs.existingParcelLog?.returned_parcels ?? 0;
          initClass[obs.id] = {
            heavy: prevHeavy,
            failed: prevFailed,
            returned: prevReturned,
          };
        });
        setClassifications(initClass);
      } catch (err: any) {
        console.error('Error loading observations:', err);
        appToast.error('Failed to load staged observations.');
      } finally {
        setIsLoadingObs(false);
      }
    },
    [activeBatch?.business_date, businessDate]
  );

  // Save Rider Mappings
  const handleSaveMappings = async () => {
    try {
      const entries = Object.entries(mappingDrafts);
      for (const [driverId, riderId] of entries) {
        if (!riderId) continue;
        const selectedRider = hubRiders.find((r) => r.id === riderId);
        if (selectedRider && effectiveHubId && selectedRider.hub_id && selectedRider.hub_id !== effectiveHubId) {
          appToast.error(`Rider ${selectedRider.name} belongs to another Hub and cannot be mapped in this Hub workspace.`);
          return;
        }
        const driverName =
          parseResult?.rows.find((r) => r.external_driver_id === driverId)?.external_driver_name ||
          observations.find((o) => o.external_driver_id === driverId)?.external_driver_name;
        await saveExternalRiderMapping({
          external_driver_id: driverId,
          external_display_name: driverName,
          rider_id: riderId,
        });
      }

      await loadReferenceData();
      if (activeBatchId) {
        await loadBatchObservations(activeBatchId);
      }
      appToast.success('Rider mappings saved.');
      setCurrentStep(4); // Move to Classify step
    } catch (err: any) {
      console.error('Error saving mappings:', err);
      appToast.error('Failed to save rider mappings.');
    }
  };

  // Open an existing batch from Recent Batches or deep-link
  const handleOpenBatch = useCallback(
    async (batchId: string, initialBatch?: FmsImportBatch) => {
      setIsLoadingObs(true);
      try {
        const batch = initialBatch || (await getFmsImportBatchById(batchId));
        if (!batch) {
          appToast.error('Batch not found or unavailable.');
          setUrlBatchId(null);
          setActiveBatchId(null);
          setActiveBatch(null);
          setCurrentStep(1);
          return;
        }

        setActiveBatch(batch);
        setActiveBatchId(batch.id);
        setBusinessDate(batch.business_date);
        setTargetHubId(batch.hub_id);
        setUrlBatchId(batch.id);

        // Load batch observations and enrich attendance & OCC
        const obsList = await getFmsBatchObservations(batch.id, batch.business_date);
        setObservations(obsList);

        // Initialize classifications draft
        const initClass: Record<string, { heavy: number; failed: number; returned: number }> = {};
        obsList.forEach((obs) => {
          const prevHeavy = obs.confirmed_heavy_delivered ?? obs.existingParcelLog?.heavy_parcels ?? 0;
          const prevFailed = obs.confirmed_failed ?? obs.failed_delivery ?? 0;
          const prevReturned = obs.confirmed_returned ?? obs.existingParcelLog?.returned_parcels ?? 0;
          initClass[obs.id] = {
            heavy: prevHeavy,
            failed: prevFailed,
            returned: prevReturned,
          };
        });
        setClassifications(initClass);

        // Deterministically resolve resume step
        const resumeStep = resolveBatchResumeStep(batch, obsList);
        setCurrentStep(resumeStep);
      } catch (err: any) {
        console.error('Error opening batch:', err);
        appToast.error('Failed to open delivery batch.');
        setUrlBatchId(null);
        setActiveBatchId(null);
        setActiveBatch(null);
        setCurrentStep(1);
      } finally {
        setIsLoadingObs(false);
      }
    },
    []
  );

  // Deep-link on mount if URL contains batchId
  useEffect(() => {
    const urlBatchId = getUrlBatchId();
    if (urlBatchId && !activeBatchId) {
      void handleOpenBatch(urlBatchId);
    }
  }, [handleOpenBatch, activeBatchId]);

  // Start New Import / Reset Context
  const handleStartNewImport = () => {
    setSelectedFile(null);
    setParseResult(null);
    setActiveBatch(null);
    setActiveBatchId(null);
    setObservations([]);
    setClassifications({});
    setMappingDrafts({});
    setUrlBatchId(null);
    setCurrentStep(1);
  };

  // Confirm Single Observation
  const handleConfirmObservation = async (obs: FmsObservationViewItem) => {
    const cls = classifications[obs.id] || { heavy: 0, failed: obs.failed_delivery, returned: 0 };
    setConfirmingIds((prev) => new Set(prev).add(obs.id));

    try {
      await confirmFmsDailyRiderObservation({
        observationId: obs.id,
        heavyDelivered: cls.heavy,
        failed: cls.failed,
        returned: cls.returned,
        expectedLogUpdatedAt: obs.existingParcelLog?.updated_at || null,
        isExistingRecord: Boolean(obs.existingParcelLog),
      });

      appToast.success(`Saved parcel record for ${obs.rider_name || obs.external_driver_name}`);
      if (activeBatchId) {
        await loadBatchObservations(activeBatchId);
      }
    } catch (err: any) {
      console.error('Confirmation error:', err);
      if (err.message?.includes('PARCEL_LOG_CONFLICT')) {
        appToast.error('Parcel record was modified since reviewed. Refreshing data...', { duration: 5000 });
        if (activeBatchId) await loadBatchObservations(activeBatchId);
      } else if (err.message?.includes('PAYROLL_PERIOD_LOCKED')) {
        appToast.error('Direct update is blocked: Cutoff period is already submitted/locked. Submit a correction request.', {
          duration: 6000,
        });
      } else {
        appToast.error(err.message || 'Failed to confirm parcel record.');
      }
    } finally {
      setConfirmingIds((prev) => {
        const next = new Set(prev);
        next.delete(obs.id);
        return next;
      });
    }
  };

  // Bulk Confirm Eligible Unconfirmed Observations
  const handleBulkConfirm = async () => {
    const eligible = observations.filter(
      (obs) =>
        obs.confirmation_status !== 'confirmed' &&
        obs.rider_id &&
        !obs.isCutoffLocked
    );

    if (eligible.length === 0) {
      appToast.show('No eligible unconfirmed records to process.');
      return;
    }

    setIsBulkConfirming(true);
    let successCount = 0;
    let failCount = 0;

    for (const obs of eligible) {
      const cls = classifications[obs.id] || { heavy: 0, failed: obs.failed_delivery, returned: 0 };
      try {
        await confirmFmsDailyRiderObservation({
          observationId: obs.id,
          heavyDelivered: cls.heavy,
          failed: cls.failed,
          returned: cls.returned,
          expectedLogUpdatedAt: obs.existingParcelLog?.updated_at || null,
          isExistingRecord: Boolean(obs.existingParcelLog),
        });
        successCount++;
      } catch (err) {
        console.error(`Failed confirming obs ${obs.id}:`, err);
        failCount++;
      }
    }

    setIsBulkConfirming(false);
    if (successCount > 0 && failCount === 0) {
      appToast.success(`Confirmation complete: ${successCount} saved.`);
    } else if (successCount > 0 && failCount > 0) {
      appToast.warning(`Partial confirmation: ${successCount} saved, ${failCount} failed.`);
    } else {
      appToast.error(`Confirmation failed: 0 saved, ${failCount} failed.`);
    }

    if (activeBatchId) {
      await loadBatchObservations(activeBatchId);
    }
  };

  const mappedRidersInParse = useMemo(() => {
    if (!parseResult) return 0;
    return parseResult.rows.filter((r) => mappings[r.external_driver_id] || mappingDrafts[r.external_driver_id]).length;
  }, [parseResult, mappings, mappingDrafts]);

  // Normalized Step 2 Validate view model (supporting pre-staged parseResult and post-staged activeBatch)
  const validateViewModel = useMemo(() => {
    if (parseResult) {
      return {
        isFresh: true,
        filename: selectedFile?.name || 'Uploaded File',
        sha256: parseResult.sha256,
        parserVersion: parseResult.parserVersion,
        rowCount: parseResult.rowCount,
        mappedCount: mappedRidersInParse,
        hubName: currentHub?.name || 'Selected Hub',
        businessDate: effectiveBusinessDate,
        importedAt: null,
        statusLabel: 'Valid Format',
        warnings: parseResult.warnings,
        isStaged: false,
      };
    }

    if (activeBatch) {
      const mappedCount = observations.filter((o) => o.rider_id).length;
      const isConfirmed = activeBatch.status === 'confirmed';
      const isPartiallyConfirmed = activeBatch.status === 'partially_confirmed';
      const statusLabel = isConfirmed
        ? 'Confirmed'
        : isPartiallyConfirmed
        ? 'Partially Confirmed'
        : 'Valid / Already Staged';

      return {
        isFresh: false,
        filename: activeBatch.filename,
        sha256: activeBatch.file_sha256,
        parserVersion: activeBatch.parser_version || 'Delivery V3.0',
        rowCount: activeBatch.source_row_count || observations.length,
        mappedCount: mappedCount,
        hubName: currentHub?.name || 'Selected Hub',
        businessDate: activeBatch.business_date,
        importedAt: activeBatch.imported_at,
        statusLabel: statusLabel,
        warnings: [],
        isStaged: true,
      };
    }

    return null;
  }, [parseResult, selectedFile, mappedRidersInParse, currentHub, effectiveBusinessDate, activeBatch, observations]);

  // Normalized Step 3 Driver mapping rows (supporting pre-staged parseResult.rows and post-staged observations)
  const driverMappingRows = useMemo(() => {
    if (parseResult) {
      return parseResult.rows.map((row) => ({
        external_driver_id: row.external_driver_id,
        external_driver_name: row.external_driver_name,
        rider_id: mappings[row.external_driver_id]?.rider_id || null,
        rider_name: mappings[row.external_driver_id]?.rider?.name,
        rider_mkb_id: mappings[row.external_driver_id]?.rider?.mkb_id,
      }));
    }

    // When parseResult is null (e.g. reopened staged batch), derive mapping rows from persisted observations
    return observations.map((obs) => ({
      external_driver_id: obs.external_driver_id,
      external_driver_name: obs.external_driver_name,
      rider_id: obs.rider_id || null,
      rider_name: obs.rider_name,
      rider_mkb_id: obs.rider_mkb_id,
    }));
  }, [parseResult, observations, mappings]);

  const dateGroupedBatches = useMemo(() => {
    return groupBatchesByDate(recentBatches);
  }, [recentBatches]);

  return (
    <motion.div
      variants={PAGE_TRANSITION_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      className="dashboard-page space-y-5 font-sans"
    >
      {/* Informational Header Card & Filters */}
      <div className="bg-white border border-border rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-accent border border-primary/20 text-primary shrink-0 mt-0.5">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">Parcel Data Import</h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent text-primary border border-primary/20">
                Assisted Workflow
              </span>
              {activeBatch && (
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Batch: {activeBatch.id.slice(0, 8)}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Import and review daily delivery data before applying it to Rider parcel records.
            </p>
          </div>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-end md:self-auto">
          <div className="flex items-center gap-1.5 bg-panel-bg px-2.5 py-1.5 rounded-lg border border-border">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={effectiveHubId}
              onChange={(e) => setTargetHubId(e.target.value)}
              disabled={currentStep > 1 || Boolean(activeBatch)}
              className="bg-transparent text-xs font-medium text-foreground focus:outline-none cursor-pointer disabled:cursor-not-allowed"
            >
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-panel-bg px-2.5 py-1.5 rounded-lg border border-border">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="date"
              value={effectiveBusinessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              disabled={currentStep > 1 || Boolean(activeBatch)}
              className="bg-transparent text-xs font-medium text-foreground focus:outline-none cursor-pointer disabled:cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {/* Compact Workflow Progress Bar */}
      <div className="flex items-center justify-between overflow-x-auto py-2 px-3.5 bg-white border border-border rounded-xl shadow-xs text-xs font-medium gap-1">
        {[
          { num: 1, label: 'Upload' },
          { num: 2, label: 'Validate' },
          { num: 3, label: 'Map Riders' },
          { num: 4, label: 'Classify' },
          { num: 5, label: 'Review' },
          { num: 6, label: 'Confirm' },
        ].map((s, idx, arr) => {
          const isAccessible =
            s.num === 1 ||
            (s.num <= 3 && Boolean(parseResult || activeBatch)) ||
            (s.num >= 4 && Boolean(activeBatch));
          const isCompleted = s.num < currentStep && isAccessible;

          return (
            <div key={s.num} className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={!isAccessible}
                onClick={() => setCurrentStep(s.num)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                  currentStep === s.num
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : isCompleted
                    ? 'text-foreground hover:bg-muted font-medium'
                    : isAccessible
                    ? 'text-muted-foreground hover:bg-muted font-medium'
                    : 'text-muted-foreground/40 cursor-not-allowed'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                    currentStep === s.num
                      ? 'bg-white/20 text-white font-bold'
                      : isCompleted
                      ? 'bg-emerald-100 text-emerald-700 font-bold'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isCompleted ? '✓' : s.num}
                </span>
                <span>{s.label}</span>
              </button>
              {idx < arr.length - 1 && <span className="text-muted-foreground/30 select-none text-[10px]">→</span>}
            </div>
          );
        })}
      </div>

      {/* STEP 1: UPLOAD & LANDING */}
      {currentStep === 1 && (
        <div className="space-y-4">
          {/* Active Staged Import Summary Card if a batch is active */}
          {activeBatch && (
            <div className="p-5 bg-panel-bg border border-border rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-primary/10 text-primary rounded-lg">
                    <FileSpreadsheet className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">Active Staged Import</h4>
                    <p className="text-[11px] text-muted-foreground font-mono truncate max-w-sm">
                      {activeBatch.filename}
                    </p>
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    activeBatch.status === 'confirmed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : activeBatch.status === 'partially_confirmed'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {activeBatch.status === 'confirmed'
                    ? 'Confirmed'
                    : activeBatch.status === 'partially_confirmed'
                    ? 'Partially Confirmed'
                    : 'Staged'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 bg-white border border-border rounded-lg">
                  <span className="text-[10px] text-muted-foreground">Business Date</span>
                  <p className="font-mono font-medium text-foreground">{activeBatch.business_date}</p>
                </div>
                <div className="p-2.5 bg-white border border-border rounded-lg">
                  <span className="text-[10px] text-muted-foreground">Riders</span>
                  <p className="font-semibold text-foreground">
                    {activeBatch.source_row_count || observations.length}
                  </p>
                </div>
                <div className="p-2.5 bg-white border border-border rounded-lg">
                  <span className="text-[10px] text-muted-foreground">Hub Workspace</span>
                  <p className="font-medium text-foreground truncate">{currentHub?.name || 'Selected Hub'}</p>
                </div>
                <div className="p-2.5 bg-white border border-border rounded-lg">
                  <span className="text-[10px] text-muted-foreground">Imported At</span>
                  <p className="text-muted-foreground">
                    {new Date(activeBatch.imported_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1 border-t border-border/60">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>File already validated and staged. The original XLSX is not retained.</span>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {isCancellable && (
                    <button
                      type="button"
                      onClick={() => setIsCancelModalOpen(true)}
                      className="px-3 py-1 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancel Import
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleStartNewImport}
                    className="px-3 py-1 bg-white border border-border rounded-lg text-xs font-semibold hover:bg-muted text-muted-foreground hover:text-foreground transition"
                  >
                    Start New Import
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(resolveBatchResumeStep(activeBatch, observations))}
                    className="px-3 py-1 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition flex items-center gap-1 shadow-xs"
                  >
                    Resume Wizard
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Main Upload Card */}
          <div className="bg-white border border-border rounded-xl p-6 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">Import Delivery File</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upload an XLSX delivery summary exported for the selected business date.
              </p>
            </div>

            {/* Dropzone Container */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors flex flex-col items-center justify-center gap-3 ${
                isDragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-panel-bg/40 hover:border-primary/40'
              }`}
            >
              <div className="p-3 bg-white rounded-full border border-border shadow-xs text-primary">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <label className="cursor-pointer inline-flex">
                  <span className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors shadow-xs">
                    <Upload className="w-3.5 h-3.5" />
                    Choose XLSX File
                  </span>
                  <input
                    type="file"
                    accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isParsing}
                  />
                </label>
                <p className="text-[11px] text-muted-foreground">or drag and drop here (XLSX only)</p>
              </div>
            </div>

            {/* Privacy Note */}
            <div className="flex items-start gap-2.5 p-3.5 bg-panel-bg border border-border rounded-xl text-xs text-muted-foreground">
              <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground">Privacy:</span> Only Rider-level delivery totals are processed. Customer and recipient information is not imported.
              </div>
            </div>
          </div>

          {/* Recent Batches Table Grouped by Date */}
          {dateGroupedBatches.length > 0 && (
            <div className="bg-white border border-border rounded-xl p-4 shadow-xs space-y-3">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-muted-foreground" />
                Recent Import Batches
              </h4>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-panel-bg text-muted-foreground border-b border-border">
                    <tr>
                      <th className="py-2 px-3 text-left font-medium">Business Date</th>
                      <th className="py-2 px-3 text-left font-medium">Latest Snapshot</th>
                      <th className="py-2 px-3 text-center font-medium">Riders</th>
                      <th className="py-2 px-3 text-center font-medium">Status</th>
                      <th className="py-2 px-3 text-center font-medium">Snapshots</th>
                      <th className="py-2 px-3 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {dateGroupedBatches.map((g) => {
                      const latest = g.latestBatch;
                      const isExpanded = expandedDateKey === g.dateKey;

                      return (
                        <tr key={g.dateKey} className="hover:bg-muted/10">
                          <td className="py-2 px-3 font-mono font-medium">{g.businessDate}</td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {new Date(latest.imported_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-2 px-3 text-center font-semibold">{latest.source_row_count}</td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                latest.status === 'confirmed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : latest.status === 'partially_confirmed'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {latest.status === 'confirmed'
                                ? 'Confirmed'
                                : latest.status === 'partially_confirmed'
                                ? 'Partially Confirmed'
                                : 'Staged'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            {g.totalSnapshots > 1 ? (
                              <button
                                type="button"
                                onClick={() => setExpandedDateKey(isExpanded ? null : g.dateKey)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                              >
                                {g.totalSnapshots} snapshots
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            ) : (
                              <span className="text-muted-foreground font-mono text-[11px]">1 snapshot</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => void handleOpenBatch(latest.id, latest)}
                              className="text-primary hover:underline font-semibold"
                            >
                              Open Latest
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Expanded Snapshot Drawer if open */}
              {expandedDateKey && (() => {
                const group = dateGroupedBatches.find((g) => g.dateKey === expandedDateKey);
                if (!group) return null;

                return (
                  <div className="p-3 bg-panel-bg border border-border rounded-lg space-y-2 text-xs">
                    <div className="flex items-center justify-between font-semibold text-foreground">
                      <span>Snapshot History for {group.businessDate}</span>
                      <button
                        type="button"
                        onClick={() => setExpandedDateKey(null)}
                        className="text-muted-foreground hover:text-foreground text-[11px]"
                      >
                        Close History
                      </button>
                    </div>
                    <div className="divide-y divide-border border border-border rounded-md bg-white">
                      {group.allBatches.map((b, idx) => (
                        <div key={b.id} className="p-2.5 flex items-center justify-between gap-2 hover:bg-muted/10">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-muted-foreground">
                              {new Date(b.imported_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="font-medium truncate max-w-xs text-foreground">{b.filename}</span>
                            <span className="text-muted-foreground">({b.source_row_count} riders)</span>
                            {idx === 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary text-[10px] font-semibold">
                                Latest
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                b.status === 'confirmed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : b.status === 'partially_confirmed'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {b.status}
                            </span>
                            <button
                              onClick={() => void handleOpenBatch(b.id, b)}
                              className="text-primary hover:underline font-semibold"
                            >
                              Open
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* STEP 2: VALIDATE */}
      {currentStep === 2 && validateViewModel && (
        <div className="space-y-4">
          <div className="bg-white border border-border rounded-xl p-5 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {validateViewModel.isFresh ? 'File Validation' : 'Staged File Validation'}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {validateViewModel.isFresh
                  ? 'Review the parsed file summary and verify alignment with your Hub workspace.'
                  : 'Persistent metadata for the staged batch loaded in this Hub workspace.'}
              </p>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-panel-bg border border-border rounded-lg">
                <span className="text-[11px] text-muted-foreground">File Status</span>
                <p className="text-xs font-bold text-emerald-600 flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {validateViewModel.statusLabel}
                </p>
              </div>
              <div className="p-3 bg-panel-bg border border-border rounded-lg">
                <span className="text-[11px] text-muted-foreground">Riders Detected</span>
                <p className="text-base font-bold text-foreground mt-0.5">{validateViewModel.rowCount}</p>
              </div>
              <div className="p-3 bg-panel-bg border border-border rounded-lg">
                <span className="text-[11px] text-muted-foreground">Mapped Riders</span>
                <p className="text-base font-bold text-foreground mt-0.5">
                  {validateViewModel.mappedCount} / {validateViewModel.rowCount}
                </p>
              </div>
              <div className="p-3 bg-panel-bg border border-border rounded-lg">
                <span className="text-[11px] text-muted-foreground">Hub Workspace</span>
                <p className="text-xs font-semibold text-foreground truncate mt-0.5">
                  {validateViewModel.hubName}
                </p>
              </div>
            </div>

            {/* Hub Assignment Mismatch Alert */}
            {hubMismatches.length > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-amber-900">
                <div className="flex items-center gap-2 font-bold text-xs text-amber-800 uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  Hub Assignment Mismatch
                </div>
                <p className="text-xs text-amber-700">
                  {hubMismatches.length} mapped Rider{hubMismatches.length > 1 ? 's belong' : ' belongs'} to another Hub.
                </p>
                <div className="space-y-1.5 pt-1">
                  {hubMismatches.map((m) => (
                    <div key={m.driverId} className="text-xs bg-white/70 rounded-lg p-2.5 border border-amber-200/60 space-y-0.5">
                      <div className="font-semibold text-foreground">
                        {m.riderName} {m.riderMkbId && <span className="font-mono text-[10px] text-muted-foreground">({m.riderMkbId})</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Assigned: <span className="font-semibold text-amber-900">{m.riderHubName}</span> &middot; Import Workspace: <span className="font-semibold text-foreground">{m.targetHubName}</span>
                      </div>
                      <div className="text-[11px] text-amber-800 font-medium pt-0.5">
                        Select {m.riderHubName} before staging this file.
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings Alert if any */}
            {validateViewModel.warnings.length > 0 && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5 text-amber-900">
                <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Validation Notices ({validateViewModel.warnings.length})
                </div>
                <ul className="list-disc list-inside text-xs space-y-0.5 text-amber-800">
                  {validateViewModel.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {!validateViewModel.isFresh && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 bg-muted/30 px-3 py-2 rounded-lg border border-border/50">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Staged Import &middot; Saved to the selected Hub workspace.</span>
              </div>
            )}

            {/* Optional Collapsible Technical Details */}
            <div className="border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium"
              >
                {showTechnicalDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Technical Provenance Details
              </button>
              {showTechnicalDetails && (
                <div className="mt-2 p-3 bg-panel-bg border border-border rounded-lg text-xs font-mono text-muted-foreground space-y-1">
                  <p>Fingerprint: {validateViewModel.sha256}</p>
                  <p>Parser: {validateViewModel.parserVersion}</p>
                  <p>Filename: {validateViewModel.filename}</p>
                  {validateViewModel.importedAt && (
                    <p>Staged At: {new Date(validateViewModel.importedAt).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Navigation */}
          <div className="flex justify-between items-center">
            <button
              onClick={() => setCurrentStep(1)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-border bg-white rounded-lg text-xs font-medium hover:bg-muted"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
            {validateViewModel.isFresh ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleStageBatch}
                  disabled={isParsing || hubMismatches.length > 0}
                  className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/90 shadow-xs disabled:opacity-50"
                  title={hubMismatches.length > 0 ? 'Resolve Hub assignment mismatches before staging' : undefined}
                >
                  Stage Batch in Hub Workspace
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {isCancellable && (
                  <button
                    type="button"
                    onClick={() => setIsCancelModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg text-xs font-semibold transition"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Cancel Import
                  </button>
                )}
                <button
                  onClick={() => setCurrentStep(3)}
                  className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/90 shadow-xs"
                >
                  Continue to Rider Mapping
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: MAP RIDERS */}
      {currentStep === 3 && (parseResult || activeBatch) && (() => {
        const allMapRows = driverMappingRows;
        const unmappedRowsCount = allMapRows.filter((r) => {
          const currentSelection = mappingDrafts[r.external_driver_id] || r.rider_id || '';
          return !currentSelection;
        }).length;
        const matchedRowsCount = allMapRows.length - unmappedRowsCount;

        const filteredMapRows = allMapRows.filter((row) => {
          const currentSelection = mappingDrafts[row.external_driver_id] || row.rider_id || '';
          const isMatched = Boolean(currentSelection);

          if (mapFilter === 'needs_mapping' && isMatched) return false;
          if (mapFilter === 'matched' && !isMatched) return false;

          if (mapSearch.trim()) {
            const q = mapSearch.toLowerCase();
            const matchedRider = hubRiders.find((r) => r.id === currentSelection);
            const matchesDriverId = row.external_driver_id.toLowerCase().includes(q);
            const matchesDriverName = row.external_driver_name.toLowerCase().includes(q);
            const matchesRiderName = matchedRider?.name.toLowerCase().includes(q) || row.rider_name?.toLowerCase().includes(q) || false;
            const matchesRiderCode = matchedRider?.mkb_id.toLowerCase().includes(q) || row.rider_mkb_id?.toLowerCase().includes(q) || false;
            if (!matchesDriverId && !matchesDriverName && !matchesRiderName && !matchesRiderCode) {
              return false;
            }
          }

          return true;
        });

        const totalMapPages = Math.max(1, Math.ceil(filteredMapRows.length / mapPageSize));
        const startIdx = (mapPage - 1) * mapPageSize;
        const displayedMapRows = filteredMapRows.slice(startIdx, startIdx + mapPageSize);

        return (
          <div className="space-y-4">
            <div className="bg-white border border-border rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Map External Drivers</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Match each external driver identifier to their MKBRiderTrack account. Saved mappings are remembered automatically.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-md bg-panel-bg border border-border text-muted-foreground">
                    Total: <strong className="text-foreground">{allMapRows.length}</strong>
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800">
                    Needs Mapping: <strong className="text-amber-900">{unmappedRowsCount}</strong>
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800">
                    Matched: <strong className="text-emerald-900">{matchedRowsCount}</strong>
                  </span>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-border">
                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search Driver ID, Name, or Rider..."
                    value={mapSearch}
                    onChange={(e) => {
                      setMapSearch(e.target.value);
                      setMapPage(1);
                    }}
                    className="w-full pl-8 pr-3 py-1.5 bg-panel-bg border border-border rounded-lg text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  />
                </div>

                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  {(
                    [
                      ['all', `All (${allMapRows.length})`],
                      ['needs_mapping', `Needs Mapping (${unmappedRowsCount})`],
                      ['matched', `Matched (${matchedRowsCount})`],
                    ] as const
                  ).map(([tabKey, tabLabel]) => (
                    <button
                      key={tabKey}
                      type="button"
                      onClick={() => {
                        setMapFilter(tabKey);
                        setMapPage(1);
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                        mapFilter === tabKey
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'bg-panel-bg border border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {tabLabel}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-panel-bg text-muted-foreground border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3 text-left font-medium">External Driver</th>
                      <th className="py-2.5 px-3 text-left font-medium">Driver ID</th>
                      <th className="py-2.5 px-3 text-left font-medium">Matched Rider</th>
                      <th className="py-2.5 px-3 text-center font-medium">Status</th>
                      <th className="py-2.5 px-3 text-center font-medium">Remember</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displayedMapRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">
                          No drivers match the current filter or search criteria.
                        </td>
                      </tr>
                    ) : (
                      displayedMapRows.map((row) => {
                        const currentSelection = mappingDrafts[row.external_driver_id] || row.rider_id || '';
                        const isMatched = Boolean(currentSelection);

                        return (
                          <tr key={row.external_driver_id} className="hover:bg-muted/10">
                            <td className="py-2.5 px-3 font-semibold text-foreground">{row.external_driver_name}</td>
                            <td className="py-2.5 px-3 font-mono text-muted-foreground">{row.external_driver_id}</td>
                            <td className="py-2.5 px-3">
                              <select
                                value={currentSelection}
                                disabled={isReadOnly}
                                onChange={(e) =>
                                  setMappingDrafts((prev) => ({
                                    ...prev,
                                    [row.external_driver_id]: e.target.value,
                                  }))
                                }
                                className="w-full max-w-xs bg-white border border-border rounded-md px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                              >
                                <option value="">-- Select Hub Rider --</option>
                                {hubRiders.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name} ({r.mkb_id})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {isMatched ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                  Matched
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                                  Needs Mapping
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                disabled={isReadOnly}
                                checked={rememberMapping[row.external_driver_id] ?? true}
                                onChange={(e) =>
                                  setRememberMapping((prev) => ({
                                    ...prev,
                                    [row.external_driver_id]: e.target.checked,
                                  }))
                                }
                                className="rounded border-border text-primary focus:ring-primary disabled:opacity-50"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {filteredMapRows.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-border text-xs text-muted-foreground">
                  <div>
                    Showing <strong className="text-foreground">{startIdx + 1}</strong>–
                    <strong className="text-foreground">
                      {Math.min(startIdx + mapPageSize, filteredMapRows.length)}
                    </strong>{' '}
                    of <strong className="text-foreground">{filteredMapRows.length}</strong> drivers
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={mapPage <= 1}
                      onClick={() => setMapPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded-lg border border-border bg-panel-bg hover:bg-muted font-medium disabled:opacity-40 inline-flex items-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Previous
                    </button>
                    <span className="font-mono font-medium text-foreground px-1">
                      Page {mapPage} of {totalMapPages}
                    </span>
                    <button
                      type="button"
                      disabled={mapPage >= totalMapPages}
                      onClick={() => setMapPage((p) => Math.min(totalMapPages, p + 1))}
                      className="px-2.5 py-1 rounded-lg border border-border bg-panel-bg hover:bg-muted font-medium disabled:opacity-40 inline-flex items-center gap-1"
                    >
                      Next
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center">
              <button
                onClick={() => setCurrentStep(2)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-border bg-white rounded-lg text-xs font-medium hover:bg-muted"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Validation
              </button>
              <div className="flex items-center gap-2">
                {isCancellable && (
                  <button
                    type="button"
                    onClick={() => setIsCancelModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg text-xs font-semibold transition"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Cancel Import
                  </button>
                )}
                {isReadOnly ? (
                  <button
                    onClick={() => setCurrentStep(4)}
                    className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/90 shadow-xs"
                  >
                    Continue to Classify
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={handleSaveMappings}
                    className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/90 shadow-xs"
                  >
                    Save Mappings & Continue
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* STEP 4: CLASSIFY */}
      {currentStep === 4 && (
        <div className="space-y-4">
          <div className="bg-white border border-border rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-foreground">Parcel Classification</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Classify Heavy deliveries. Standard parcels are derived automatically as{' '}
                  <span className="font-semibold text-foreground">Standard = Delivered − Heavy</span>.
                </p>
              </div>
              <div className="text-xs bg-panel-bg px-3 py-1.5 rounded-lg border border-border text-muted-foreground">
                Total Riders: <strong className="text-foreground">{observations.length}</strong>
              </div>
            </div>

            {isReadOnly && (
              <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>This batch is {activeBatch?.status}. Classification inputs are view-only.</span>
              </div>
            )}

            {isLoadingObs ? (
              <div className="p-12 text-center text-muted-foreground text-xs bg-panel-bg rounded-lg">
                Loading observations...
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-panel-bg text-muted-foreground border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3 text-left font-medium">Rider</th>
                      <th className="py-2.5 px-3 text-left font-medium">Attendance & Rate Tier</th>
                      <th className="py-2.5 px-3 text-center font-medium bg-muted/20">Delivered (Imported)</th>
                      <th className="py-2.5 px-3 text-center font-medium">Heavy (Input)</th>
                      <th className="py-2.5 px-3 text-center font-medium text-primary">Standard (Derived)</th>
                      <th className="py-2.5 px-3 text-center font-medium">Failed</th>
                      <th className="py-2.5 px-3 text-center font-medium">Returned</th>
                      <th className="py-2.5 px-3 text-center font-medium">Total Classified</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {observations.map((obs) => {
                      const cls = classifications[obs.id] || {
                        heavy: obs.confirmed_heavy_delivered ?? 0,
                        failed: obs.confirmed_failed ?? obs.failed_delivery,
                        returned: obs.confirmed_returned ?? obs.existingParcelLog?.returned_parcels ?? 0,
                      };
                      const derivedStandard = Math.max(0, obs.delivered - cls.heavy);
                      const isComplete = derivedStandard + cls.heavy === obs.delivered;
                      const hasAttendance = Boolean(obs.attendance?.time_in);
                      const rateInfo = rateContext
                        ? resolveRateTierInfo(rateContext, obs.attendance?.raw_time_in || obs.attendance?.time_in)
                        : null;

                      return (
                        <tr key={obs.id} className="hover:bg-muted/10">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-foreground">{obs.rider_name || obs.external_driver_name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              ID: {obs.external_driver_id} {obs.rider_mkb_id ? `• ${obs.rider_mkb_id}` : ''}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {hasAttendance ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  Time In {obs.attendance?.time_in}
                                </span>
                                {rateInfo?.rate && (
                                  <div className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                                    <Coins className="w-3 h-3 text-primary" />
                                    ₱{rateInfo.rate} {rateInfo.label}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                Missing Time In
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-foreground bg-muted/10">
                            {obs.delivered}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              min={0}
                              max={obs.delivered}
                              disabled={isReadOnly || obs.confirmation_status === 'confirmed' || obs.isCutoffLocked}
                              value={cls.heavy}
                              onChange={(e) => {
                                const val = Math.min(obs.delivered, Math.max(0, parseInt(e.target.value, 10) || 0));
                                setClassifications((prev) => ({
                                  ...prev,
                                  [obs.id]: { ...prev[obs.id], heavy: val },
                                }));
                              }}
                              className="w-16 text-center bg-white border border-border rounded-md py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-primary">{derivedStandard}</td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              min={0}
                              disabled={isReadOnly || obs.confirmation_status === 'confirmed' || obs.isCutoffLocked}
                              value={cls.failed}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                setClassifications((prev) => ({
                                  ...prev,
                                  [obs.id]: { ...prev[obs.id], failed: val },
                                }));
                              }}
                              className="w-14 text-center bg-white border border-border rounded-md py-1 text-xs text-red-600 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              min={0}
                              disabled={isReadOnly || obs.confirmation_status === 'confirmed' || obs.isCutoffLocked}
                              value={cls.returned}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                setClassifications((prev) => ({
                                  ...prev,
                                  [obs.id]: { ...prev[obs.id], returned: val },
                                }));
                              }}
                              className="w-14 text-center bg-white border border-border rounded-md py-1 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center font-medium">
                            {isComplete ? (
                              <span className="text-emerald-600 font-semibold">
                                {cls.heavy + derivedStandard} / {obs.delivered}
                              </span>
                            ) : (
                              <span className="text-amber-600">
                                {cls.heavy + derivedStandard} / {obs.delivered}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={() => setCurrentStep(3)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-border bg-white rounded-lg text-xs font-medium hover:bg-muted"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
            <div className="flex items-center gap-2">
              {isCancellable && (
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg text-xs font-semibold transition"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel Import
                </button>
              )}
              <button
                onClick={() => setCurrentStep(5)}
                className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/90 shadow-xs"
              >
                Review Comparisons
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: REVIEW */}
      {currentStep === 5 && (
        <div className="space-y-4">
          <div className="bg-white border border-border rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-foreground">Review Parcel Comparisons</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Compare current system records against proposed import values before committing.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (activeBatchId) {
                    await loadBatchObservations(activeBatchId);
                    appToast.success('Refreshed attendance and comparison data.');
                  }
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-panel-bg border border-border text-foreground rounded-lg hover:bg-muted transition shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                Refresh Attendance
              </button>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-panel-bg text-muted-foreground border-b border-border">
                  <tr>
                    <th className="py-2.5 px-3 text-left font-medium">Rider</th>
                    <th className="py-2.5 px-3 text-left font-medium">Attendance & Rate</th>
                    <th className="py-2.5 px-3 text-left font-medium">Current System Record</th>
                    <th className="py-2.5 px-3 text-left font-medium">Proposed Import</th>
                    <th className="py-2.5 px-3 text-left font-medium">Change</th>
                    <th className="py-2.5 px-3 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {observations.map((obs) => {
                    const cls = classifications[obs.id] || {
                      heavy: obs.confirmed_heavy_delivered ?? 0,
                      failed: obs.confirmed_failed ?? obs.failed_delivery,
                      returned: obs.confirmed_returned ?? obs.existingParcelLog?.returned_parcels ?? 0,
                    };
                    const propStd = Math.max(0, obs.delivered - cls.heavy);
                    const currStd = obs.existingParcelLog?.parcels ?? 0;
                    const currHeavy = obs.existingParcelLog?.heavy_parcels ?? 0;
                    const isNew = !obs.existingParcelLog;
                    const hasAttendance = Boolean(obs.attendance?.time_in);
                    const rateInfo = rateContext
                      ? resolveRateTierInfo(rateContext, obs.attendance?.raw_time_in || obs.attendance?.time_in)
                      : null;

                    return (
                      <tr key={obs.id} className="hover:bg-muted/10">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-foreground">{obs.rider_name || obs.external_driver_name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{obs.rider_mkb_id || 'Unmapped'}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          {hasAttendance ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Present · {obs.attendance?.time_in} (₱{rateInfo?.rate})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              Missing Time In
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">
                          {obs.existingParcelLog ? (
                            <span>
                              Std: <strong className="text-foreground">{currStd}</strong>, Heavy: <strong>{currHeavy}</strong>
                            </span>
                          ) : (
                            <span className="italic text-muted-foreground/70">No existing record</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-medium">
                          Std: <strong className="text-primary">{propStd}</strong>, Heavy: <strong>{cls.heavy}</strong>
                        </td>
                        <td className="py-2.5 px-3">
                          {isNew ? (
                            <span className="text-emerald-600 font-semibold">+ New Record</span>
                          ) : (
                            <span className="font-mono text-[11px]">
                              {propStd - currStd >= 0 ? `+${propStd - currStd}` : `${propStd - currStd}`} Std,{' '}
                              {cls.heavy - currHeavy >= 0 ? `+${cls.heavy - currHeavy}` : `${cls.heavy - currHeavy}`} Heavy
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {obs.isCutoffLocked ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-800"
                              title="Cutoff is locked. Direct update is blocked."
                            >
                              <Lock className="w-3 h-3" /> Locked
                            </span>
                          ) : obs.confirmation_status === 'confirmed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                              <Check className="w-3 h-3" /> Confirmed
                            </span>
                          ) : !hasAttendance ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                              Attendance Required
                            </span>
                          ) : isNew ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800">
                              Ready (New)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                              Changed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={() => setCurrentStep(4)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-border bg-white rounded-lg text-xs font-medium hover:bg-muted"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
            <div className="flex items-center gap-2">
              {isCancellable && (
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg text-xs font-semibold transition"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel Import
                </button>
              )}
              <button
                onClick={() => setCurrentStep(6)}
                className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/90 shadow-xs"
              >
                Proceed to Confirmation
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 6: CONFIRM */}
      {currentStep === 6 && (() => {
        const unmappedCount = observations.filter((o) => !o.rider_id).length;
        const lockedCount = observations.filter((o) => o.isCutoffLocked).length;
        const confirmedCount = observations.filter((o) => o.confirmation_status === 'confirmed').length;
        const missingAttendanceCount = observations.filter(
          (o) => Boolean(o.rider_id) && !o.isCutoffLocked && o.confirmation_status !== 'confirmed' && !o.attendance?.time_in
        ).length;
        const readyToConfirmCount = observations.filter(
          (o) =>
            Boolean(o.rider_id) &&
            !o.isCutoffLocked &&
            o.confirmation_status !== 'confirmed' &&
            Boolean(o.attendance?.time_in)
        ).length;

        return (
          <div className="space-y-4">
            {/* Confirmation Action Summary Card */}
            <div className="bg-white border border-border rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Confirm Parcel Results</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Reviewed data will be committed to authoritative daily parcel records and update draft payroll.
                  </p>
                </div>
                {!isReadOnly && (
                  <button
                    type="button"
                    disabled={isBulkConfirming || readyToConfirmCount === 0}
                    onClick={handleBulkConfirm}
                    className="bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {isBulkConfirming ? 'Processing...' : `Confirm Ready Riders (${readyToConfirmCount})`}
                  </button>
                )}
              </div>

              {isReadOnly && (
                <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    This batch is {activeBatch?.status}. All parcel records are finalized and locked in read-only audit mode.
                  </span>
                </div>
              )}

              {/* Quick Status Pill Bar */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border text-xs">
                <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                  {readyToConfirmCount} Ready to Confirm
                </span>
                {missingAttendanceCount > 0 && (
                  <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                    {missingAttendanceCount} Missing Attendance
                  </span>
                )}
                {unmappedCount > 0 && (
                  <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                    {unmappedCount} Requires Mapping
                  </span>
                )}
                {lockedCount > 0 && (
                  <span className="px-2.5 py-1 rounded-md bg-red-50 text-red-800 border border-red-200 font-medium">
                    {lockedCount} Locked (Correction Required)
                  </span>
                )}
                {confirmedCount > 0 && (
                  <span className="px-2.5 py-1 rounded-md bg-muted text-muted-foreground border border-border font-medium">
                    {confirmedCount} Already Saved
                  </span>
                )}
              </div>

              {/* Missing Attendance Warning Notice */}
              {missingAttendanceCount > 0 && !isReadOnly && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5 text-amber-900">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-amber-800">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      Attendance Time In Required ({missingAttendanceCount} Rider{missingAttendanceCount > 1 ? 's' : ''})
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if (activeBatchId) {
                          await loadBatchObservations(activeBatchId);
                          appToast.success('Refreshed attendance records.');
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-white border border-amber-300 text-amber-900 rounded-lg hover:bg-amber-100/60 transition shadow-xs cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3 text-amber-700" />
                      Refresh Attendance
                    </button>
                  </div>
                  <p className="text-xs text-amber-800">
                    Official attendance Time In is required before confirming parcel earnings. Riders with missing attendance cannot be confirmed until their morning Time In is recorded in Attendance Logs.
                  </p>
                </div>
              )}

              {/* Confirmation Table */}
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-panel-bg text-muted-foreground border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3 text-left font-medium">Rider</th>
                      <th className="py-2.5 px-3 text-left font-medium">Attendance</th>
                      <th className="py-2.5 px-3 text-center font-medium">Delivered Total</th>
                      <th className="py-2.5 px-3 text-center font-medium">Standard</th>
                      <th className="py-2.5 px-3 text-center font-medium">Heavy</th>
                      <th className="py-2.5 px-3 text-center font-medium">Status</th>
                      <th className="py-2.5 px-3 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {observations.map((obs) => {
                      const cls = classifications[obs.id] || {
                        heavy: obs.confirmed_heavy_delivered ?? 0,
                        failed: obs.confirmed_failed ?? obs.failed_delivery,
                        returned: obs.confirmed_returned ?? obs.existingParcelLog?.returned_parcels ?? 0,
                      };
                      const stdDeliv = Math.max(0, obs.delivered - cls.heavy);
                      const isConfirming = confirmingIds.has(obs.id);
                      const hasAttendance = Boolean(obs.attendance?.time_in);

                      return (
                        <tr key={obs.id} className="hover:bg-muted/10">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-foreground">{obs.rider_name || obs.external_driver_name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{obs.rider_mkb_id || 'Unmapped'}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            {hasAttendance ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                Present · {obs.attendance?.time_in}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                Missing Time In
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-foreground">{obs.delivered}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-primary">{stdDeliv}</td>
                          <td className="py-2.5 px-3 text-center font-semibold text-foreground">{cls.heavy}</td>
                          <td className="py-2.5 px-3 text-center">
                            {obs.isCutoffLocked ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-800">
                                Locked
                              </span>
                            ) : obs.confirmation_status === 'confirmed' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                Confirmed
                              </span>
                            ) : !hasAttendance ? (
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800"
                                title="Attendance Time In is required"
                              >
                                Missing Attendance
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800">
                                Ready
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              disabled={
                                isReadOnly ||
                                obs.confirmation_status === 'confirmed' ||
                                obs.isCutoffLocked ||
                                !obs.rider_id ||
                                !hasAttendance ||
                                isConfirming
                              }
                              title={
                                !hasAttendance
                                  ? 'Attendance Time In is required before confirming parcel results. Please record attendance in Attendance Logs first.'
                                  : undefined
                              }
                              onClick={() => handleConfirmObservation(obs)}
                              className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-md hover:bg-primary/90 disabled:opacity-40 shadow-xs cursor-pointer disabled:cursor-not-allowed"
                            >
                              {isConfirming
                                ? 'Saving...'
                                : obs.confirmation_status === 'confirmed'
                                ? 'Saved'
                                : 'Confirm'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <button
                onClick={() => setCurrentStep(5)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-border bg-white rounded-lg text-xs font-medium hover:bg-muted"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Review
              </button>
              <div className="flex items-center gap-2">
                {isCancellable && (
                  <button
                    type="button"
                    onClick={() => setIsCancelModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg text-xs font-semibold transition"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Cancel Import
                  </button>
                )}
                <button
                  onClick={handleStartNewImport}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-border bg-white rounded-lg text-xs font-medium hover:bg-muted"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Import Another File
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Safe Cancel Staged Import Confirmation Modal */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-border rounded-xl shadow-lg max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-2.5 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-sm font-bold text-foreground">Cancel this staged import?</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              No parcel records have been confirmed. The import will remain in history as <span className="font-semibold text-foreground">Cancelled</span> and will free this delivery file to be re-staged if needed.
            </p>
            <div className="flex justify-end items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                disabled={isCancelling}
                className="px-3.5 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted text-foreground"
              >
                Keep Staged Batch
              </button>
              <button
                type="button"
                onClick={handleCancelBatch}
                disabled={isCancelling}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50"
              >
                {isCancelling ? 'Cancelling...' : 'Yes, Cancel Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
