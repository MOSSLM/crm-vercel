"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  StickyNote,
  Plus,
  Loader2,
  Trash2,
  Pencil,
  LayoutGrid,
  MoreHorizontal,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { planchesApi } from "@/lib/planches/api";
import type { PlancheBoardSummary } from "@/types";

export default function PlanchesGalleryPage() {
  const router = useRouter();
  const [boards, setBoards] = React.useState<PlancheBoardSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [renaming, setRenaming] = React.useState<PlancheBoardSummary | null>(null);
  const [renameTitle, setRenameTitle] = React.useState("");
  const [deleting, setDeleting] = React.useState<PlancheBoardSummary | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setBoards(await planchesApi.listBoards());
    } catch (err) {
      console.error(err);
      toast.error("Impossible de charger les planches");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    setCreating(true);
    try {
      const board = await planchesApi.createBoard({ title: newTitle.trim() || "Sans titre" });
      setCreateOpen(false);
      setNewTitle("");
      router.push(`/planches/${board.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Création échouée");
    } finally {
      setCreating(false);
    }
  }

  async function handleRename() {
    if (!renaming) return;
    try {
      await planchesApi.updateBoard(renaming.id, { title: renameTitle.trim() || "Sans titre" });
      setBoards((prev) =>
        prev.map((b) =>
          b.id === renaming.id ? { ...b, title: renameTitle.trim() || "Sans titre" } : b,
        ),
      );
      setRenaming(null);
    } catch (err) {
      console.error(err);
      toast.error("Renommage échoué");
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await planchesApi.deleteBoard(deleting.id);
      setBoards((prev) => prev.filter((b) => b.id !== deleting.id));
      toast.success("Planche supprimée");
    } catch (err) {
      console.error(err);
      toast.error("Suppression échouée");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <AppLayout>
      <div className="px-6 py-6 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <StickyNote className="h-6 w-6" />
              Planches
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Vos tableaux visuels — notes, images, fichiers et liens sur un canvas infini.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nouvelle planche
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement...
          </div>
        ) : boards.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Aucune planche pour l&apos;instant.</p>
              <Button className="mt-4" variant="outline" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Créer votre première planche
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {boards.map((board) => (
              <Card
                key={board.id}
                className="group relative cursor-pointer overflow-hidden transition-all hover:shadow-md hover:-translate-y-0.5"
                onClick={() => router.push(`/planches/${board.id}`)}
              >
                <div
                  className="aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 dark:from-slate-800 dark:to-slate-900"
                  style={board.color ? { background: board.color } : undefined}
                >
                  <StickyNote className="h-10 w-10 text-amber-400/70 dark:text-slate-600" />
                </div>
                <CardContent className="p-3">
                  <p className="text-sm font-medium truncate" title={board.title}>
                    {board.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {board.card_count} élément{board.card_count > 1 ? "s" : ""}
                  </p>
                </CardContent>
                <div
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="secondary" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setRenaming(board);
                          setRenameTitle(board.title);
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" /> Renommer
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onClick={() => setDeleting(board)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle planche</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Titre de la planche..."
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename */}
      <Dialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renommer la planche</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Annuler
            </Button>
            <Button onClick={handleRename}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette planche ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {deleting?.title} » et tout son contenu (cartes, sous-planches, fichiers) seront
              supprimés définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
