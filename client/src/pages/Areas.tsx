import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Search, Plus, Ban, Undo2, Pencil, FileText, Unlink, Merge } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

export default function Areas() {
  const utils = trpc.useUtils();
  const { data: areas, isLoading } = trpc.areas.list.useQuery();
  const { data: hospitals } = trpc.hospitals.list.useQuery();
  const { data: excludedOrders } = trpc.matches.excluded.useQuery();

  const [searchTerm, setSearchTerm] = useState("");
  const [hospitalFilter, setHospitalFilter] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPurchasesDialog, setShowPurchasesDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);
  const [selectedAreaName, setSelectedAreaName] = useState("");
  const [selectedAreaHospitalId, setSelectedAreaHospitalId] = useState<number | null>(null);
  const [mergeTargetAreaId, setMergeTargetAreaId] = useState<string>("");
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaHospitalId, setNewAreaHospitalId] = useState<string>("");

  const [editAreaName, setEditAreaName] = useState("");
  const [moveToAreaId, setMoveToAreaId] = useState<string>("");



  const { data: selectedAreaPurchases, refetch: refetchPurchases } = trpc.areas.getPurchases.useQuery(
    { areaId: selectedAreaId! },
    { enabled: !!selectedAreaId && showPurchasesDialog }
  );

  const createArea = trpc.areas.create.useMutation({
    onSuccess: () => {
      toast.success("Area created");
      utils.areas.list.invalidate();
      setShowAddDialog(false);
      setNewAreaName("");
      setNewAreaHospitalId("");
    },
    onError: (error) => toast.error(`Failed: ${error.message}`),
  });

  const renameArea = trpc.areas.rename.useMutation({
    onSuccess: () => {
      toast.success("Area renamed");
      utils.areas.list.invalidate();
      setShowEditDialog(false);
      setEditAreaName("");
    },
    onError: (error) => toast.error(`Failed: ${error.message}`),
  });



  const unlinkPurchase = trpc.areas.unlinkPurchase.useMutation({
    onSuccess: () => {
      toast.success("Purchase unlinked - it will appear in pending matches");
      refetchPurchases();
      utils.matches.pending.invalidate();
      utils.reorders.statuses.invalidate();
    },
    onError: (error) => toast.error(`Failed: ${error.message}`),
  });

  const movePurchase = trpc.areas.movePurchase.useMutation({
    onSuccess: () => {
      toast.success("Purchase moved to new area");
      refetchPurchases();
      utils.reorders.statuses.invalidate();
    },
    onError: (error) => toast.error(`Failed: ${error.message}`),
  });

  const mergeAreas = trpc.areas.merge.useMutation({
    onSuccess: (data) => {
      toast.success(`Areas merged - ${data.purchasesMoved} purchases moved`);
      utils.areas.list.invalidate();
      utils.reorders.statuses.invalidate();
      setShowMergeDialog(false);
      setMergeTargetAreaId("");
    },
    onError: (error) => toast.error(`Failed: ${error.message}`),
  });

  const unexclude = trpc.matches.unexclude.useMutation({
    onSuccess: () => {
      toast.success("Order re-included - it will appear in pending matches");
      utils.matches.excluded.invalidate();
      utils.matches.pending.invalidate();
    },
    onError: (error) => toast.error(`Failed: ${error.message}`),
  });

  const filteredAreas = useMemo(() => {
    if (!areas) return [];
    return areas.filter(a => {
      const matchesSearch = searchTerm === "" ||
        a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.hospitalName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesHospital = hospitalFilter === "all" || a.hospitalId.toString() === hospitalFilter;
      return matchesSearch && matchesHospital;
    });
  }, [areas, searchTerm, hospitalFilter]);

  const hospitalCounts = useMemo(() => {
    if (!areas) return {};
    const counts: Record<number, number> = {};
    for (const a of areas) {
      counts[a.hospitalId] = (counts[a.hospitalId] || 0) + 1;
    }
    return counts;
  }, [areas]);

  // Get areas for the same hospital (for move dropdown)
  const sameHospitalAreas = useMemo(() => {
    if (!areas || !selectedAreaHospitalId) return [];
    return areas.filter(a => a.hospitalId === selectedAreaHospitalId && a.id !== selectedAreaId).sort((a, b) => a.name.localeCompare(b.name));
  }, [areas, selectedAreaHospitalId, selectedAreaId]);

  const openEditDialog = (area: { id: number; name: string }) => {
    setSelectedAreaId(area.id);
    setEditAreaName(area.name);
    setShowEditDialog(true);
  };

  const openPurchasesDialog = (area: { id: number; name: string; hospitalId: number }) => {
    setSelectedAreaId(area.id);
    setSelectedAreaName(area.name);
    setSelectedAreaHospitalId(area.hospitalId);
    setMoveToAreaId("");
    setShowPurchasesDialog(true);
  };

  const openMergeDialog = (area: { id: number; name: string; hospitalId: number }) => {
    setSelectedAreaId(area.id);
    setSelectedAreaName(area.name);
    setSelectedAreaHospitalId(area.hospitalId);
    setMergeTargetAreaId("");
    setShowMergeDialog(true);
  };

  // Component to show area name with hover card for linked purchases
  const AreaNameWithHover = ({ area }: { area: { id: number; name: string } }) => {
    const { data: purchases, isLoading } = trpc.areas.getPurchases.useQuery(
      { areaId: area.id },
      { enabled: false } // Only fetch on hover
    );
    const [hasHovered, setHasHovered] = useState(false);
    const utils = trpc.useUtils();

    const handleHover = () => {
      if (!hasHovered) {
        setHasHovered(true);
        utils.areas.getPurchases.fetch({ areaId: area.id });
      }
    };

    return (
      <HoverCard openDelay={200}>
        <HoverCardTrigger asChild onMouseEnter={handleHover}>
          <span className="cursor-help underline decoration-dotted underline-offset-2">{area.name}</span>
        </HoverCardTrigger>
        <HoverCardContent className="w-80" align="start">
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Linked Purchases</h4>
            {!hasHovered || isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : purchases && purchases.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-auto">
                {purchases.slice(0, 10).map((p) => (
                  <div key={p.id} className="text-xs border-b pb-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{p.orderNumber}</span>
                      <span className="text-muted-foreground">
                        {new Date(p.orderDate).toLocaleDateString()}
                      </span>
                    </div>
                    {p.customerRef && (
                      <div className="text-muted-foreground truncate mt-0.5" title={p.customerRef}>
                        {p.customerRef}
                      </div>
                    )}
                  </div>
                ))}
                {purchases.length > 10 && (
                  <div className="text-xs text-muted-foreground pt-1">
                    +{purchases.length - 10} more...
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No purchases linked</div>
            )}
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Area Management</h1>
            <p className="text-muted-foreground">Manage hospital areas</p>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Area</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Area</DialogTitle>
                <DialogDescription>Create a new hospital area for tracking.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Hospital</Label>
                  <Select value={newAreaHospitalId} onValueChange={setNewAreaHospitalId}>
                    <SelectTrigger><SelectValue placeholder="Select hospital..." /></SelectTrigger>
                    <SelectContent>
                      {hospitals?.map(h => (
                        <SelectItem key={h.id} value={h.id.toString()}>{h.customerName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Area Name</Label>
                  <Input value={newAreaName} onChange={(e) => setNewAreaName(e.target.value)} placeholder="e.g., ICU, Ward 3, Emergency" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                <Button onClick={() => createArea.mutate({ hospitalId: parseInt(newAreaHospitalId), name: newAreaName })} disabled={!newAreaHospitalId || !newAreaName || createArea.isPending}>
                  Create Area
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Naming Convention Guide */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4 pb-4">
            <div className="text-sm text-blue-800">
              <span className="font-medium">Area Naming Convention: </span>
              <span className="text-blue-700">
                1. Where (town) → 2. What (department/function) → 3. Location (building/level) → 4. Sub-location (room number)
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search areas..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Combobox
                className="w-full md:w-[250px]"
                placeholder="All Hospitals"
                searchPlaceholder="Search hospitals..."
                emptyText="No hospitals found."
                value={hospitalFilter}
                onValueChange={setHospitalFilter}
                options={[
                  { value: "all", label: "All Hospitals" },
                  ...(hospitals?.map(h => ({ value: h.id.toString(), label: `${h.customerName} (${hospitalCounts[h.id] || 0})` })) || [])
                ]}
              />
              {(hospitalFilter !== 'all' || searchTerm) && (
                <Button variant="ghost" onClick={() => { setHospitalFilter('all'); setSearchTerm(''); }}>Clear</Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Areas Table */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Areas ({filteredAreas.length})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
            ) : filteredAreas.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {areas?.length === 0 ? <p>No areas yet. Run a sync or add areas manually.</p> : <p>No areas match your filters.</p>}
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hospital</TableHead>
                      <TableHead>Area Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAreas.map((area) => (
                      <TableRow key={area.id}>
                        <TableCell className="font-medium">{area.hospitalName}</TableCell>
                        <TableCell>
                          <AreaNameWithHover area={area} />
                        </TableCell>
                        <TableCell>
                          {area.isConfirmed ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">Confirmed</Badge>
                          ) : (
                            <Badge variant="outline">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell>{new Date(area.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(area)} title="Edit area name">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openPurchasesDialog(area)} title="View linked purchases">
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openMergeDialog(area)} title="Merge into another area">
                            <Merge className="h-4 w-4" />
                          </Button>

                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Excluded Orders Section */}
        {excludedOrders && excludedOrders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Ban className="h-5 w-5 text-red-500" />
                Excluded Orders ({excludedOrders.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                These orders have been excluded from matching. They remain in the database to prevent re-download on sync.
              </p>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hospital</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {excludedOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.hospitalName}</TableCell>
                        <TableCell>{order.orderNumber}</TableCell>
                        <TableCell>{new Date(order.orderDate).toLocaleDateString()}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={order.customerRef || undefined}>
                          {order.customerRef || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-red-600">
                            {order.excludeReason || 'No reason'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => unexclude.mutate({ purchaseId: order.id })}
                            disabled={unexclude.isPending}
                          >
                            <Undo2 className="h-4 w-4 mr-1" />
                            Re-include
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Edit Area Name Dialog */}
        <Dialog open={showEditDialog} onOpenChange={(open) => { setShowEditDialog(open); if (!open) setSelectedAreaId(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Area Name</DialogTitle>
              <DialogDescription>Change the name of this area.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>New Area Name</Label>
                <Input value={editAreaName} onChange={(e) => setEditAreaName(e.target.value)} placeholder="Enter new name..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
              <Button 
                onClick={() => renameArea.mutate({ areaId: selectedAreaId!, newName: editAreaName })} 
                disabled={!editAreaName || renameArea.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Linked Purchases Dialog */}
        <Dialog open={showPurchasesDialog} onOpenChange={(open) => { setShowPurchasesDialog(open); if (!open) { setSelectedAreaId(null); setSelectedAreaName(""); setSelectedAreaHospitalId(null); } }}>
          <DialogContent className="!max-w-[90vw] !w-[900px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Linked Purchases - {selectedAreaName}</DialogTitle>
              <DialogDescription>View and manage orders linked to this area. You can unlink orders or move them to a different area.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {selectedAreaPurchases?.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No purchases linked to this area.</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedAreaPurchases?.map((purchase) => (
                        <TableRow key={purchase.id}>
                          <TableCell className="font-medium">{purchase.orderNumber}</TableCell>
                          <TableCell>{new Date(purchase.orderDate).toLocaleDateString()}</TableCell>
                          <TableCell className="max-w-[200px] truncate" title={purchase.customerRef || undefined}>
                            {purchase.customerRef || purchase.rawAreaText || '-'}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => unlinkPurchase.mutate({ purchaseId: purchase.id })}
                              disabled={unlinkPurchase.isPending}
                              title="Unlink and send to pending matches"
                            >
                              <Unlink className="h-4 w-4 mr-1" />
                              Unlink
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              
              {/* Move to different area section */}
              {selectedAreaPurchases && selectedAreaPurchases.length > 0 && sameHospitalAreas.length > 0 && (
                <div className="border-t pt-4 mt-4">
                  <Label className="text-sm font-medium">Move Selected Purchase to Different Area</Label>
                  <p className="text-sm text-muted-foreground mb-2">Select a purchase above, then choose a destination area.</p>
                  <div className="flex gap-2 items-center">
                    <Select value={moveToAreaId} onValueChange={setMoveToAreaId}>
                      <SelectTrigger className="w-[300px]">
                        <SelectValue placeholder="Select destination area..." />
                      </SelectTrigger>
                      <SelectContent>
                        {sameHospitalAreas.map(a => (
                          <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    To move a purchase: click "Unlink" to send it to pending matches, then re-match it to the correct area.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPurchasesDialog(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Merge Areas Dialog */}
        <Dialog open={showMergeDialog} onOpenChange={(open) => { setShowMergeDialog(open); if (!open) { setSelectedAreaId(null); setSelectedAreaName(""); setSelectedAreaHospitalId(null); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Merge Area</DialogTitle>
              <DialogDescription>
                Merge "{selectedAreaName}" into another area. All linked purchases will be moved to the target area, and this area will be deleted.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Merge into:</Label>
                <Select value={mergeTargetAreaId} onValueChange={setMergeTargetAreaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select target area..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sameHospitalAreas.map(a => (
                      <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sameHospitalAreas.length === 0 && (
                  <p className="text-sm text-muted-foreground">No other areas exist for this hospital.</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowMergeDialog(false)}>Cancel</Button>
              <Button 
                variant="destructive"
                onClick={() => mergeAreas.mutate({ sourceAreaId: selectedAreaId!, targetAreaId: parseInt(mergeTargetAreaId) })}
                disabled={!mergeTargetAreaId || mergeAreas.isPending}
              >
                {mergeAreas.isPending ? "Merging..." : "Merge & Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


      </div>
    </DashboardLayout>
  );
}
