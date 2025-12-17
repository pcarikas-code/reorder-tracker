import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle, XCircle, Clock, Database } from "lucide-react";
import { toast } from "sonner";

export default function Sync() {
  const utils = trpc.useUtils();
  const { data: syncStatus, isLoading } = trpc.sync.status.useQuery();

  const runSync = trpc.sync.run.useMutation({
    onSuccess: (data) => {
      toast.success(`Sync completed! Processed ${data.recordsProcessed} records.`);
      utils.sync.status.invalidate();
      utils.hospitals.list.invalidate();
      utils.areas.list.invalidate();
      utils.reorders.statuses.invalidate();
      utils.forecasts.list.invalidate();
      utils.matches.pending.invalidate();
    },
    onError: (error) => {
      toast.error(`Sync failed: ${error.message}`);
      utils.sync.status.invalidate();
    },
  });

  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case 'completed':
        return <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
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
                  {syncStatus.recordsProcessed !== null && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Records Processed</span>
                      <span className="text-sm font-medium">{syncStatus.recordsProcessed}</span>
                    </div>
                  )}
                  {syncStatus.errorMessage && (
                    <div className="mt-2 p-2 bg-destructive/10 rounded text-sm text-destructive">
                      {syncStatus.errorMessage}
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
              <Button
                onClick={() => runSync.mutate()}
                disabled={runSync.isPending}
                className="w-full"
              >
                {runSync.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Start Sync
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

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
