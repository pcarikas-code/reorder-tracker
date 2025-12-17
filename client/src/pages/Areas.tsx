import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Tag, Building2 } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

export default function Areas() {
  const utils = trpc.useUtils();
  const { data: areas, isLoading } = trpc.areas.list.useQuery();
  const { data: hospitals } = trpc.hospitals.list.useQuery();

  const [searchTerm, setSearchTerm] = useState("");
  const [hospitalFilter, setHospitalFilter] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAliasDialog, setShowAliasDialog] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaHospitalId, setNewAreaHospitalId] = useState<string>("");
  const [newAlias, setNewAlias] = useState("");

  const { data: selectedAreaAliases } = trpc.areas.getAliases.useQuery(
    { areaId: selectedAreaId! },
    { enabled: !!selectedAreaId }
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

  const addAlias = trpc.areas.addAlias.useMutation({
    onSuccess: () => {
      toast.success("Alias added");
      utils.areas.getAliases.invalidate({ areaId: selectedAreaId! });
      setNewAlias("");
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Area Management</h1>
            <p className="text-muted-foreground">Manage hospital areas and name aliases</p>
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
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Hospital</Label>
                  <Select value={newAreaHospitalId} onValueChange={setNewAreaHospitalId}>
                    <SelectTrigger><SelectValue placeholder="Select hospital..." /></SelectTrigger>
                    <SelectContent>
                      {hospitals?.map(h => <SelectItem key={h.id} value={h.id.toString()}>{h.customerName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Area Name</Label>
                  <Input value={newAreaName} onChange={(e) => setNewAreaName(e.target.value)} placeholder="e.g., ICU, Emergency Department" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                <Button onClick={() => createArea.mutate({ hospitalId: parseInt(newAreaHospitalId), name: newAreaName })} disabled={!newAreaName || !newAreaHospitalId || createArea.isPending}>
                  Create Area
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4" />Total Areas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{areas?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4" />Hospitals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{hospitals?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Tag className="h-4 w-4" />Confirmed Areas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{areas?.filter(a => a.isConfirmed).length || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search areas..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Select value={hospitalFilter} onValueChange={setHospitalFilter}>
                <SelectTrigger className="w-full md:w-[250px]"><SelectValue placeholder="Hospital" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hospitals</SelectItem>
                  {hospitals?.map(h => (
                    <SelectItem key={h.id} value={h.id.toString()}>
                      {h.customerName} ({hospitalCounts[h.id] || 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                        <TableCell>{area.name}</TableCell>
                        <TableCell>
                          {area.isConfirmed ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">Confirmed</Badge>
                          ) : (
                            <Badge variant="outline">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell>{new Date(area.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedAreaId(area.id); setShowAliasDialog(true); }}>
                            <Tag className="h-4 w-4 mr-1" />Aliases
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

        {/* Aliases Dialog */}
        <Dialog open={showAliasDialog} onOpenChange={(open) => { setShowAliasDialog(open); if (!open) setSelectedAreaId(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manage Aliases</DialogTitle>
              <DialogDescription>
                Aliases help automatically match different spellings or abbreviations to this area.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Current Aliases</Label>
                {selectedAreaAliases?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedAreaAliases.map((alias) => (
                      <Badge key={alias.id} variant="secondary">{alias.alias}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No aliases defined.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Add New Alias</Label>
                <div className="flex gap-2">
                  <Input value={newAlias} onChange={(e) => setNewAlias(e.target.value)} placeholder="e.g., ICU, Intensive Care" />
                  <Button onClick={() => addAlias.mutate({ areaId: selectedAreaId!, alias: newAlias })} disabled={!newAlias || addAlias.isPending}>
                    Add
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAliasDialog(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
