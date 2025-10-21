/**
 * Reservations Page
 * 
 * Displays inbox of reservation requests and responses
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/state/useAuth";
import { useRelays } from "@/state/useRelays";
import { useReservations } from "@/state/useReservations";
import { useReservationActions } from "@/hooks/useReservationActions";
import { loadAndDecryptSecret } from "@/lib/secureStore";
import { skFromNsec } from "@/lib/nostrKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Inbox, Users, Calendar, Clock, MessageSquare, AlertCircle, Check, X, CalendarDays } from "lucide-react";
import type { ReservationRequest, ReservationResponse } from "@/types/reservation";
import type { ReservationMessage } from "@/services/reservationService";

export function ReservationsPage(): JSX.Element {
  const pubkey = useAuth((state) => state.pubkey);
  const relays = useRelays((state) => state.relays);
  const {
    messages,
    isConnected,
    error: subscriptionError,
    startListening,
    stopListening,
  } = useReservations();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pubkey || !relays.length) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Load private key
        const nsec = await loadAndDecryptSecret();
        if (!nsec) {
          throw new Error("Unable to load private key");
        }

        if (cancelled) return;

        const privateKey = skFromNsec(nsec);
        startListening(privateKey, pubkey, relays);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to start listening";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      stopListening();
    };
  }, [pubkey, relays, startListening, stopListening]);

  if (loading) {
    return (
      <div className="container flex min-h-[400px] items-center justify-center py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Connecting to relays...</p>
        </div>
      </div>
    );
  }

  if (error || subscriptionError) {
    return (
      <div className="container py-10">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <h3 className="font-semibold text-destructive">Connection Error</h3>
              <p className="mt-1 text-sm text-destructive/90">
                {error || subscriptionError}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reservations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage incoming reservation requests from AI concierge agents
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <div className="h-2 w-2 rounded-full bg-emerald-600" />
              <span>Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-muted-foreground" />
              <span>Disconnected</span>
            </div>
          )}
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-muted p-4">
              <Inbox className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold">No reservations yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Reservation requests from AI agents will appear here
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((message) => (
            <ReservationMessageCard key={message.rumor.id} message={message} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ReservationMessageCardProps {
  message: ReservationMessage;
}

function ReservationMessageCard({ message }: ReservationMessageCardProps): JSX.Element {
  const { type, payload, senderPubkey, rumor } = message;
  const timestamp = new Date(rumor.created_at * 1000);

  const {
    state: actionState,
    resetState,
    acceptReservation,
    declineReservation,
    suggestAlternativeTime,
  } = useReservationActions();

  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [suggestDialogOpen, setSuggestDialogOpen] = useState(false);

  const [tableNumber, setTableNumber] = useState("");
  const [acceptMessage, setAcceptMessage] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [suggestedTime, setSuggestedTime] = useState("");
  const [suggestMessage, setSuggestMessage] = useState("");

  const handleAccept = async () => {
    try {
      await acceptReservation(message, {
        table: tableNumber || undefined,
        message: acceptMessage || undefined,
      });
      setAcceptDialogOpen(false);
      setTableNumber("");
      setAcceptMessage("");
    } catch (error) {
      // Error is handled in the hook state
    }
  };

  const handleDecline = async () => {
    try {
      await declineReservation(message, {
        message: declineReason || undefined,
      });
      setDeclineDialogOpen(false);
      setDeclineReason("");
    } catch (error) {
      // Error is handled in the hook state
    }
  };

  const handleSuggest = async () => {
    if (!suggestedTime) return;
    try {
      await suggestAlternativeTime(message, {
        alternativeTime: suggestedTime,
        message: suggestMessage || undefined,
      });
      setSuggestDialogOpen(false);
      setSuggestedTime("");
      setSuggestMessage("");
    } catch (error) {
      // Error is handled in the hook state
    }
  };

  if (type === "request") {
    const request = payload as ReservationRequest;
    return (
      <>
        <div className="rounded-lg border bg-card p-6 transition-shadow hover:shadow-md">
          {actionState.success && (
            <div className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-600">
              Response sent successfully!
            </div>
          )}
          {actionState.error && (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {actionState.error}
            </div>
          )}
          
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">New Reservation Request</h3>
                  <p className="text-xs text-muted-foreground">
                    From: {senderPubkey.slice(0, 8)}...{senderPubkey.slice(-8)}
                  </p>
                </div>
              </div>

              {/* Details */}
              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{request.party_size} guests</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{new Date(request.iso_time).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{new Date(request.iso_time).toLocaleTimeString()}</span>
                </div>
                {request.notes && (
                  <div className="flex items-start gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{request.notes}</span>
                  </div>
                )}
                {request.contact?.name && (
                  <div className="text-xs text-muted-foreground">
                    Contact: {request.contact.name}
                    {request.contact.phone && ` • ${request.contact.phone}`}
                  </div>
                )}
              </div>

              {/* Timestamp */}
              <div className="text-xs text-muted-foreground">
                Received {timestamp.toLocaleString()}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={() => setAcceptDialogOpen(true)}
                disabled={actionState.loading}
              >
                <Check className="mr-1 h-3 w-3" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeclineDialogOpen(true)}
                disabled={actionState.loading}
              >
                <X className="mr-1 h-3 w-3" />
                Decline
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSuggestDialogOpen(true)}
                disabled={actionState.loading}
              >
                <CalendarDays className="mr-1 h-3 w-3" />
                Suggest
              </Button>
            </div>
          </div>
        </div>

        {/* Accept Dialog */}
        <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Accept Reservation</DialogTitle>
              <DialogDescription>
                Confirm the reservation for {request.party_size} guests on{" "}
                {new Date(request.iso_time).toLocaleString()}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="table">Table Number (optional)</Label>
                <Input
                  id="table"
                  placeholder="e.g., A4, 12, Patio 3"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="accept-message">Message (optional)</Label>
                <Textarea
                  id="accept-message"
                  placeholder="Any additional notes for the guest..."
                  value={acceptMessage}
                  onChange={(e) => setAcceptMessage(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAcceptDialogOpen(false)}
                disabled={actionState.loading}
              >
                Cancel
              </Button>
              <Button onClick={handleAccept} disabled={actionState.loading}>
                {actionState.loading ? "Sending..." : "Confirm Acceptance"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Decline Dialog */}
        <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Decline Reservation</DialogTitle>
              <DialogDescription>
                Decline the reservation request for {request.party_size} guests on{" "}
                {new Date(request.iso_time).toLocaleString()}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="decline-reason">Reason (optional)</Label>
                <Textarea
                  id="decline-reason"
                  placeholder="e.g., Fully booked, closed that day..."
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeclineDialogOpen(false)}
                disabled={actionState.loading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDecline}
                disabled={actionState.loading}
              >
                {actionState.loading ? "Sending..." : "Decline Request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Suggest Dialog */}
        <Dialog open={suggestDialogOpen} onOpenChange={setSuggestDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Suggest Alternative Time</DialogTitle>
              <DialogDescription>
                Propose a different time for {request.party_size} guests
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="suggested-time">Alternative Date & Time</Label>
                <Input
                  id="suggested-time"
                  type="datetime-local"
                  value={suggestedTime}
                  onChange={(e) => setSuggestedTime(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="suggest-message">Message (optional)</Label>
                <Textarea
                  id="suggest-message"
                  placeholder="Why this time works better..."
                  value={suggestMessage}
                  onChange={(e) => setSuggestMessage(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSuggestDialogOpen(false)}
                disabled={actionState.loading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSuggest}
                disabled={actionState.loading || !suggestedTime}
              >
                {actionState.loading ? "Sending..." : "Send Suggestion"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Response message
  const response = payload as ReservationResponse;
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-muted p-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 space-y-2">
          <div>
            <h3 className="font-semibold">
              Response: {response.status.charAt(0).toUpperCase() + response.status.slice(1)}
            </h3>
            <p className="text-xs text-muted-foreground">
              To: {senderPubkey.slice(0, 8)}...{senderPubkey.slice(-8)}
            </p>
          </div>
          
          {response.status === "confirmed" && response.iso_time && (
            <div className="text-sm">
              <p>Confirmed for {new Date(response.iso_time).toLocaleString()}</p>
              {response.table && <p className="text-muted-foreground">Table: {response.table}</p>}
              {response.hold_expires_at && (
                <p className="text-xs text-muted-foreground">
                  Hold expires: {new Date(response.hold_expires_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
          
          {response.status === "declined" && (
            <div className="text-sm">
              <p className="text-destructive">Declined</p>
              {response.message && <p className="text-muted-foreground">{response.message}</p>}
            </div>
          )}
          
          {response.status === "suggested" && response.iso_time && (
            <div className="text-sm">
              <p>Suggested alternative time:</p>
              <p className="text-muted-foreground">{new Date(response.iso_time).toLocaleString()}</p>
              {response.message && <p className="mt-1 text-muted-foreground">{response.message}</p>}
            </div>
          )}

          {response.status === "expired" && (
            <div className="text-sm text-muted-foreground">
              <p>Reservation expired</p>
              {response.message && <p>{response.message}</p>}
            </div>
          )}

          {response.status === "cancelled" && (
            <div className="text-sm text-muted-foreground">
              <p>Reservation cancelled</p>
              {response.message && <p>{response.message}</p>}
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Sent {timestamp.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

