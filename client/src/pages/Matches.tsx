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
import { AlertTriangle, Check, X, Sparkles, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Matches() {
  const utils = trpc.useUtils();
  const { data: pendingMatches, isLoading } = trpc.matches.pending.useQuery();
  const { data: areas } = trpc.areas.list.useQuery();
  const { data: hospitals } = trpc.hospitals.list.useQuery();

  const [selectedMatch, setSelectedMatch] = useState<NonNullable<typeof pendingMatches>[number] | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string>("");
  const [addAlias, setAddAlias] = useState(true);
  const [showNewAreaDialog, setShowNewAreaDialog] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaHospitalId, setNewAreaHospitalId] = useState<string>("");
  const [llmSuggestion, setLlmSuggestion] = useState<{ bestMatchId: number | null; confidence: number; reasoning: string; isNewArea: boolean; suggestedName: string } | null>(null);
  const [isGettingSuggestion, setIsGettingSuggestion] = useState(false);

  const confirmMatch = trpc.matches.confirm.useMutation({
    onSuccess: () => {
      toast.success("Match confirmed");
      utils.matches.pending.invalidate();
      utils.reorders.statuses.invalidate();
      setSelectedMatch(null as any);
      setSelectedAreaId("");
      setLlmSuggestion(null);
    },
    onError: (error) => toast.error(`Failed: ${error.message}`),
  });

  const createNewArea = trpc.matches.createNewArea.useMutation({
    onSuccess: () => {
      toast.success("New area created and matched");
      utils.matches.pending.invalidate();
      utils.areas.list.invalidate();
      utils.reorders.statuses.invalidate();
      setShowNewAreaDialog(false);
      setSelectedMatch(null as any);
      setNewAreaName("");
      setNewAreaHospitalId("");
      setLlmSuggestion(null);
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

  const handleGetSuggestion = async (match: NonNullable<typeof selectedMatch>) => {
    if (!areas) return;
    setIsGettingSuggestion(true);
    try {
      const result = await getLlmSuggestion.mutateAsync({
        rawAreaText: match.rawAreaText || "",
        existingAreas: areas.map(a => ({ id: a.id, name: a.name, hospitalName: a.hospitalName })),
      });
      if (result) {
        setLlmSuggestion(result);
        if (result.bestMatchId && !result.isNewArea) {
          setSelectedAreaId(result.bestMatchId.toString());
        }
        if (result.isNewArea && result.suggestedName) {
          setNewAreaName(result.suggestedName);
        }
      }
    } catch (error) {
      toast.error("Failed to get AI suggestion");
    } finally {
      setIsGettingSuggestion(false);
    }
  };

  const handleConfirm = () => {
    if (!selectedMatch || !selectedAreaId) return;
    confirmMatch.mutate({
      matchId: selectedMatch.id,
      areaId: parseInt(selectedAreaId),
      addAlias,
    });
  };

  const handleCreateNewArea = () => {
    if (!selectedMatch || !newAreaName || !newAreaHospitalId) return;
    createNewArea.mutate({
      matchId: selectedMatch.id,
      hospitalId: parseInt(newAreaHospitalId),
      areaName: newAreaName,
    });
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
                  <div key={match.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-1">
                      <div className="font-medium">{match.rawAreaText}</div>
                      <div className="text-sm text-muted-foreground">
                        Purchase ID: {match.purchaseId}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedMatch(match);
                          setSelectedAreaId("");
                          setLlmSuggestion(null);
                        }}
                      >
                        Match to Area
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedMatch(match);
                          setShowNewAreaDialog(true);
                          setNewAreaName(match.rawAreaText || "");
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        New Area
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => rejectMatch.mutate({ matchId: match.id })}
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

        {/* Match to Existing Area Dialog */}
        <Dialog open={!!selectedMatch && !showNewAreaDialog} onOpenChange={(open) => { if (!open) { setSelectedMatch(null as any); setLlmSuggestion(null); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Match Area</DialogTitle>
              <DialogDescription>
                Select an existing area to match with "{selectedMatch?.rawAreaText}"
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectedMatch && handleGetSuggestion(selectedMatch)}
                  disabled={isGettingSuggestion}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {isGettingSuggestion ? "Analyzing..." : "Get AI Suggestion"}
                </Button>
              </div>

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

              <div className="space-y-2">
                <Label>Select Area</Label>
                <Select value={selectedAreaId} onValueChange={setSelectedAreaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an area..." />
                  </SelectTrigger>
                  <SelectContent>
                    {areas?.map((area) => (
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
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setSelectedMatch(null as any); setLlmSuggestion(null); }}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={!selectedAreaId || confirmMatch.isPending}>
                <Check className="h-4 w-4 mr-2" />
                Confirm Match
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create New Area Dialog */}
        <Dialog open={showNewAreaDialog} onOpenChange={setShowNewAreaDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Area</DialogTitle>
              <DialogDescription>
                Create a new area for "{selectedMatch?.rawAreaText}"
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
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
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewAreaDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateNewArea} disabled={!newAreaName || !newAreaHospitalId || createNewArea.isPending}>
                <Plus className="h-4 w-4 mr-2" />
                Create & Match
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
