import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Check, X, Sparkles, Plus, Link } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Matches() {
  const utils = trpc.useUtils();
  const { data: pendingMatches, isLoading } = trpc.matches.pending.useQuery();
  const { data: areas } = trpc.areas.list.useQuery();
  const { data: hospitals } = trpc.hospitals.list.useQuery();

  const [selectedMatch, setSelectedMatch] = useState<NonNullable<typeof pendingMatches>[number] | null>(null);
  const [activeTab, setActiveTab] = useState<string>("existing");
  const [selectedAreaId, setSelectedAreaId] = useState<string>("");
  const [addAlias, setAddAlias] = useState(true);
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaHospitalId, setNewAreaHospitalId] = useState<string>("");
  const [llmSuggestion, setLlmSuggestion] = useState<{ bestMatchId: number | null; confidence: number; reasoning: string; isNewArea: boolean; suggestedName: string } | null>(null);
  const [isGettingSuggestion, setIsGettingSuggestion] = useState(false);

  const confirmMatch = trpc.matches.confirm.useMutation({
    onSuccess: () => {
      toast.success("Match confirmed");
      utils.matches.pending.invalidate();
      utils.reorders.statuses.invalidate();
      closeDialog();
    },
    onError: (error) => toast.error(`Failed: ${error.message}`),
  });

  const createNewArea = trpc.matches.createNewArea.useMutation({
    onSuccess: () => {
      toast.success("New area created and matched");
      utils.matches.pending.invalidate();
      utils.areas.list.invalidate();
      utils.reorders.statuses.invalidate();
      closeDialog();
    },
    onError: (error) => toast.error(`Failed: ${error.message}`),
  });

  const rejectMatch = trpc.matches.reject.useMutation({
    onSuccess: () => {
      toast.success("Match rejected");
      utils.matches.pending.invalidate();
    },
    onError: (error) => toast.error(`Failed: ${error.message}`),
  });

  const getLlmSuggestion = trpc.matches.getLlmSuggestion.useMutation();

  const closeDialog = () => {
    setSelectedMatch(null);
    setSelectedAreaId("");
    setNewAreaName("");
    setNewAreaHospitalId("");
    setLlmSuggestion(null);
    setActiveTab("existing");
  };

  const openDialog = (match: NonNullable<typeof pendingMatches>[number]) => {
    setSelectedMatch(match);
    setSelectedAreaId("");
    setNewAreaName(match.rawAreaText || "");
    setLlmSuggestion(null);
    // Pre-select hospital from the order
    if ((match as any).hospitalId) {
      setNewAreaHospitalId((match as any).hospitalId.toString());
    }
    // Default to "new" tab if no existing areas
    setActiveTab(areas && areas.length > 0 ? "existing" : "new");
  };

  const handleGetSuggestion = async () => {
    if (!selectedMatch) return;
    setIsGettingSuggestion(true);
    try {
      const result = await getLlmSuggestion.mutateAsync({
        rawAreaText: selectedMatch.rawAreaText || "",
        existingAreas: (areas || []).map(a => ({ id: a.id, name: a.name, hospitalName: a.hospitalName })),
      });
      if (result) {
        setLlmSuggestion(result);
        if (result.bestMatchId && !result.isNewArea) {
          setSelectedAreaId(result.bestMatchId.toString());
          setActiveTab("existing");
        }
        if (result.isNewArea) {
          setNewAreaName(result.suggestedName || selectedMatch.rawAreaText || "");
          setActiveTab("new");
        }
      }
    } catch (error) {
      toast.error("Failed to get AI suggestion");
    } finally {
      setIsGettingSuggestion(false);
    }
  };

  const handleConfirm = () => {
    if (!selectedMatch) return;
    
    if (activeTab === "existing" && selectedAreaId) {
      confirmMatch.mutate({
        matchId: selectedMatch.id,
        areaId: parseInt(selectedAreaId),
        addAlias,
      });
    } else if (activeTab === "new" && newAreaName && newAreaHospitalId) {
      createNewArea.mutate({
        matchId: selectedMatch.id,
        hospitalId: parseInt(newAreaHospitalId),
        areaName: newAreaName,
      });
    }
  };

  const canConfirm = () => {
    if (activeTab === "existing") return !!selectedAreaId;
    if (activeTab === "new") return !!newAreaName && !!newAreaHospitalId;
    return false;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pending Matches</h1>
          <p className="text-muted-foreground">Review and confirm area name matches from orders</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Unmatched Orders ({pendingMatches?.length || 0})
            </CardTitle>
            <CardDescription>
              These orders have area names that couldn't be automatically matched. Review and confirm the correct area or create a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : !pendingMatches?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <Check className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <p>All orders have been matched!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingMatches.map((match) => (
                  <div key={match.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="font-medium text-lg">{match.rawAreaText}</div>
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-normal">
                            {(match as any).hospitalName || 'Unknown Hospital'}
                          </Badge>
                          <span className="text-xs">Order: {(match as any).orderNumber || `#${match.purchaseId}`}</span>
                          {(match as any).orderDate && (
                            <span className="text-xs">
                              {new Date((match as any).orderDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {(match as any).customerRef && (
                          <div className="text-xs text-muted-foreground/70 truncate max-w-md" title={(match as any).customerRef}>
                            Ref: {(match as any).customerRef}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => openDialog(match)}
                      >
                        Resolve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => rejectMatch.mutate({ matchId: match.id })}
                        title="Reject - not an area"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Combined Resolve Match Dialog */}
        <Dialog open={!!selectedMatch} onOpenChange={(open) => { if (!open) closeDialog(); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Resolve Match</DialogTitle>
              <DialogDescription>
                Match "{selectedMatch?.rawAreaText}" to an existing area or create a new one
              </DialogDescription>
            </DialogHeader>
            
            {/* Show original reference for context */}
            {(selectedMatch as any)?.customerRef && (
              <div className="p-3 bg-slate-50 border rounded-lg text-sm">
                <div className="text-xs text-muted-foreground mb-1">Original Reference:</div>
                <div className="font-mono text-xs break-all">{(selectedMatch as any).customerRef}</div>
                <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                  <span>{(selectedMatch as any).hospitalName}</span>
                  <span>•</span>
                  <span>{(selectedMatch as any).orderNumber}</span>
                </div>
              </div>
            )}

            {/* AI Suggestion Button */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGetSuggestion}
                disabled={isGettingSuggestion}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {isGettingSuggestion ? "Analyzing..." : "Get AI Suggestion"}
              </Button>
            </div>

            {/* AI Suggestion Result */}
            {llmSuggestion && (
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="font-medium">AI Suggestion</span>
                  <Badge variant={llmSuggestion.confidence > 70 ? "default" : "secondary"}>
                    {llmSuggestion.confidence}% confident
                  </Badge>
                </div>
                <p className="text-sm">{llmSuggestion.reasoning}</p>
                {llmSuggestion.isNewArea && (
                  <p className="text-sm text-amber-600">Suggested as new area: "{llmSuggestion.suggestedName}"</p>
                )}
              </div>
            )}

            {/* Tabs for Existing vs New Area */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="existing" className="flex items-center gap-2">
                  <Link className="h-4 w-4" />
                  Link to Existing
                </TabsTrigger>
                <TabsTrigger value="new" className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Create New
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="existing" className="space-y-4 mt-4">
                {areas && areas.length > 0 ? (
                  <>
                    <div className="space-y-2">
                      <Label>Select Area</Label>
                      <Select value={selectedAreaId} onValueChange={setSelectedAreaId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose an area..." />
                        </SelectTrigger>
                        <SelectContent>
                          {areas.map((area) => (
                            <SelectItem key={area.id} value={area.id.toString()}>
                              {area.hospitalName} - {area.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox id="addAlias" checked={addAlias} onCheckedChange={(checked) => setAddAlias(checked === true)} />
                      <Label htmlFor="addAlias" className="text-sm">
                        Add "{selectedMatch?.rawAreaText}" as an alias for future auto-matching
                      </Label>
                    </div>
                  </>
                ) : (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 text-center">
                    No existing areas yet. Switch to "Create New" tab to create the first area.
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="new" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Hospital</Label>
                  <Select value={newAreaHospitalId} onValueChange={setNewAreaHospitalId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select hospital..." />
                    </SelectTrigger>
                    <SelectContent>
                      {hospitals?.map((h) => (
                        <SelectItem key={h.id} value={h.id.toString()}>{h.customerName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Area Name</Label>
                  <Input
                    value={newAreaName}
                    onChange={(e) => setNewAreaName(e.target.value)}
                    placeholder="Enter area name..."
                  />
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button 
                onClick={handleConfirm} 
                disabled={!canConfirm() || confirmMatch.isPending || createNewArea.isPending}
              >
                <Check className="h-4 w-4 mr-2" />
                {activeTab === "existing" ? "Confirm Match" : "Create & Match"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
