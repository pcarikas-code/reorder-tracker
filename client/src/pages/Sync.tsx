import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle, XCircle, Clock, Database, Trash2, AlertTriangle, Loader2, StopCircle, Ban } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

export default function Sync() {
  const utils = trpc.useUtils();
  const { data: syncStatus, isLoading } = trpc.sync.status.useQuery();

  const runSync = trpc.sync.run.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.info(data.message + ' - Refresh the page to check progress.');
      } else {
        toast.warning(data.message);
      }
      utils.sync.status.invalidate();
    },
    onError: (error) => {
      toast.error(`Sync failed: ${error.message}`);
      utils.sync.status.invalidate();
    },
  });

  const { data: cleanupPreview, refetch: refetchCleanup } = trpc.sync.previewCleanup.useQuery();
  
  const runCleanup = trpc.sync.runCleanup.useMutation({
    onSuccess: (data) => {
      toast.success(`Cleanup complete! Removed ${data.purchasesDeleted} orphan purchases and ${data.pendingMatchesDeleted} pending matches.`);
      refetchCleanup();
      utils.matches.pending.invalidate();
      utils.reorders.statuses.invalidate();
    },
    onError: (error) => {
      toast.error(`Cleanup failed: ${error.message}`);
    },
  });

  const cancelSync = trpc.sync.cancel.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.info(data.message);
      } else {
        toast.warning(data.message);
      }
      utils.sync.status.invalidate();
    },
    onError: (error) => {
      toast.error(`Cancel failed: ${error.message}`);
    },
  });

  // Poll for sync status when running
  const isRunning = syncStatus?.status === 'running';
  const wasRunning = useRef(false);
  
  // Auto-poll while sync is running
  const { refetch } = trpc.sync.status.useQuery(undefined, {
    refetchInterval: isRunning ? 2000 : false,
  });
  
  // When sync completes, invalidate all data
  useEffect(() => {
    if (wasRunning.current && !isRunning && syncStatus?.status === 'completed') {
      toast.success(`Sync completed! Processed ${syncStatus.recordsProcessed || 0} records.`);
      utils.hospitals.list.invalidate();
      utils.areas.list.invalidate();
      utils.reorders.statuses.invalidate();
      utils.forecasts.list.invalidate();
      utils.matches.pending.invalidate();
    }
    wasRunning.current = isRunning;
  }, [isRunning, syncStatus?.status, syncStatus?.recordsProcessed, utils]);

  // Calculate progress percentage from step string
  const getProgressPercent = (step: string | undefined): number => {
    if (!step) return 0;
    if (step === 'Complete') return 100;
    const match = step.match(/Step (\d+)\/(\d+)/);
    if (match) {
      const current = parseInt(match[1]);
      const total = parseInt(match[2]);
      return Math.round((current / total) * 100);
    }
    return 10; // Default to 10% if can't parse
  };

  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case 'completed':
        return <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case 'cancelled':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800"><Ban className="h-3 w-3 mr-1" />Cancelled</Badge>;
      case 'running':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800"><Clock className="h-3 w-3 mr-1" />Running</Badge>;
      default:
        return <Badge variant="outline">Never Run</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Data Sync</h1>
          <p className="text-muted-foreground">Synchronize data from Unleashed inventory system</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Sync Status
              </CardTitle>
              <CardDescription>
                Last synchronization details from Synchub
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : syncStatus ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Status</span>
                    {getStatusBadge(syncStatus.status)}
                  </div>
                  
                  {/* Progress indicator when running */}
                  {syncStatus.status === 'running' && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                          <span className="text-sm font-medium text-blue-800">
                            {(syncStatus as any).progressStep || 'Starting...'}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancelSync.mutate()}
                          disabled={cancelSync.isPending}
                          className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50"
                        >
                          {cancelSync.isPending ? (
                            <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Cancelling...</>
                          ) : (
                            <><StopCircle className="h-3 w-3 mr-1" />Cancel</>
                          )}
                        </Button>
                      </div>
                      {(syncStatus as any).progressDetail && (
                        <p className="text-xs text-blue-600">
                          {(syncStatus as any).progressDetail}
                        </p>
                      )}
                      <Progress 
                        value={getProgressPercent((syncStatus as any).progressStep)} 
                        className="h-2" 
                      />
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Started</span>
                    <span className="text-sm">{new Date(syncStatus.startedAt).toLocaleString()}</span>
                  </div>
                  {syncStatus.completedAt && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Completed</span>
                      <span className="text-sm">{new Date(syncStatus.completedAt).toLocaleString()}</span>
                    </div>
                  )}
                  {syncStatus.recordsProcessed !== null && syncStatus.status !== 'running' && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Records Processed</span>
                      <span className="text-sm font-medium">{syncStatus.recordsProcessed}</span>
                    </div>
                  )}
                  {syncStatus.errorMessage && (
                    <div className="mt-2 p-2 bg-destructive/10 rounded text-sm text-destructive">
                      <strong>Error:</strong> {syncStatus.errorMessage}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No sync has been run yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Run Sync
              </CardTitle>
              <CardDescription>
                Pull latest data from Unleashed via Synchub
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This will synchronize:
              </p>
              <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                <li>Customer records (hospitals)</li>
                <li>Sales orders with Sporicidal Curtains</li>
                <li>Order line items and product details</li>
              </ul>
              <div className="flex gap-2">
                <Button
                  onClick={() => runSync.mutate({ incremental: true })}
                  disabled={runSync.isPending || isRunning || !syncStatus?.completedAt}
                  variant="outline"
                  className="flex-1"
                  title={!syncStatus?.completedAt ? 'Run a full sync first' : 'Only sync changes since last sync'}
                >
                  {runSync.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Quick Sync
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => runSync.mutate({})}
                  disabled={runSync.isPending || isRunning}
                  className="flex-1"
                >
                  {runSync.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Full Sync
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                <strong>Quick Sync:</strong> Only fetches orders modified since last sync (faster).<br/>
                <strong>Full Sync:</strong> Re-syncs all historical data (use for first sync or to fix issues).
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Data Cleanup
            </CardTitle>
            <CardDescription>
              Remove orphan records that don't have any Endurocide products
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {runCleanup.isPending ? (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">Cleaning up database...</span>
                </div>
                <div className="text-xs text-blue-600 space-y-1">
                  <div>• Identifying orphan purchases...</div>
                  <div>• Removing associated pending matches...</div>
                  <div>• Deleting orphan purchase records...</div>
                </div>
                <Progress value={50} className="h-2" />
              </div>
            ) : cleanupPreview && cleanupPreview.count > 0 ? (
              <>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-800 mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">Found {cleanupPreview.count} orphan purchases</span>
                  </div>
                  <p className="text-sm text-amber-700 mb-2">
                    These orders have no Endurocide product lines and should be removed.
                  </p>
                  {cleanupPreview.samples.length > 0 && (
                    <div className="text-xs text-amber-600 space-y-1">
                      <div className="font-medium">Sample records:</div>
                      {cleanupPreview.samples.slice(0, 5).map((s, i) => (
                        <div key={i}>• {s.orderNumber} - {s.hospitalName}</div>
                      ))}
                      {cleanupPreview.count > 5 && <div>...and {cleanupPreview.count - 5} more</div>}
                    </div>
                  )}
                </div>
                <Button
                  onClick={() => runCleanup.mutate()}
                  disabled={runCleanup.isPending}
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />Remove {cleanupPreview.count} Orphan Records
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="h-4 w-4" />
                <span>No orphan records found. Database is clean!</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About Data Sync</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none text-muted-foreground">
            <p>
              The sync process connects to your Synchub SQL Azure database which mirrors your Unleashed inventory data.
              It imports customer records as hospitals and sales orders containing Sporicidal Curtains products.
            </p>
            <p>
              Area names are extracted from the Customer Reference field in orders. When an area name cannot be
              automatically matched to an existing area, it will appear in the Pending Matches queue for manual review.
            </p>
            <p>
              <strong>Tip:</strong> Run a sync after making changes in Unleashed to ensure the tracker has the latest data.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
