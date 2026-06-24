import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

const empty = { email: "", password: "", name: "", role: "user" };

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", role: "user", password: "" });

  const load = async () => {
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/users", form);
      setForm(empty);
      setOpen(false);
      await load();
      toast.success("Bruger oprettet");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (uid) => {
    try {
      await api.delete(`/users/${uid}`);
      await load();
      toast.success("Bruger slettet");
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const openEdit = (u) => {
    setEditUser(u);
    setEditForm({ name: u.name || "", role: u.role || "user", password: "" });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editUser) return;
    const payload = { name: editForm.name, role: editForm.role };
    if (editForm.password) payload.password = editForm.password;
    try {
      await api.patch(`/users/${editUser.id}`, payload);
      setEditUser(null);
      await load();
      toast.success("Bruger opdateret");
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto" data-testid="users-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Brugere</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Administrer hvem der kan logge ind i systemet
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              data-testid="create-user-button"
            >
              <Plus className="w-4 h-4 mr-2" strokeWidth={1.6} />
              Ny bruger
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white" data-testid="create-user-dialog">
            <DialogHeader>
              <DialogTitle>Opret bruger</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user-name">Navn</Label>
                <Input
                  id="user-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  data-testid="user-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  data-testid="user-email-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-password">Adgangskode</Label>
                <Input
                  id="user-password"
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  data-testid="user-password-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Rolle</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm({ ...form, role: v })}
                >
                  <SelectTrigger data-testid="user-role-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user" data-testid="role-user">Bruger (læse)</SelectItem>
                    <SelectItem value="editor" data-testid="role-editor">Editor (deltager-håndtering)</SelectItem>
                    <SelectItem value="admin" data-testid="role-admin">Administrator (fuld adgang)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)} data-testid="user-cancel">
                  Annullér
                </Button>
                <Button
                  type="submit"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  disabled={saving}
                  data-testid="user-save-button"
                >
                  {saving ? "Gemmer..." : "Opret"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-8 border border-border rounded-md bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Navn</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rolle</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} data-testid={`user-row-${u.id}`}>
                <TableCell className="font-medium">{u.name || "—"}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  {u.role === "admin" ? (
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/10 border-primary/20">
                      Administrator
                    </Badge>
                  ) : u.role === "editor" ? (
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">
                      Editor
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="font-normal">Bruger</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(u)}
                      title="Rediger bruger"
                      data-testid={`edit-user-${u.id}`}
                    >
                      <Pencil className="w-4 h-4" strokeWidth={1.6} />
                    </Button>
                    {u.id !== user?.id && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          data-testid={`delete-user-${u.id}`}
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={1.6} />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-white">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Slet {u.email}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Brugeren mister adgang til systemet. Dette kan ikke fortrydes.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid={`delete-user-cancel-${u.id}`}>Annullér</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(u.id)}
                            className="bg-destructive hover:bg-destructive/90"
                            data-testid={`delete-user-confirm-${u.id}`}
                          >
                            Slet
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="bg-white" data-testid="edit-user-dialog">
          <DialogHeader>
            <DialogTitle>Rediger {editUser?.email}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-user-name">Navn</Label>
              <Input
                id="edit-user-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                data-testid="edit-user-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-user-password">Ny adgangskode (lad stå tom for at beholde)</Label>
              <Input
                id="edit-user-password"
                type="text"
                placeholder="••••••••"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                data-testid="edit-user-password-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Rolle</Label>
              <Select
                value={editForm.role}
                onValueChange={(v) => setEditForm({ ...editForm, role: v })}
                disabled={editUser?.id === user?.id}
              >
                <SelectTrigger data-testid="edit-user-role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="user" data-testid="edit-role-user">Bruger (læse)</SelectItem>
                  <SelectItem value="editor" data-testid="edit-role-editor">Editor (deltager-håndtering)</SelectItem>
                  <SelectItem value="admin" data-testid="edit-role-admin">Administrator (fuld adgang)</SelectItem>
                </SelectContent>
              </Select>
              {editUser?.id === user?.id && (
                <p className="text-xs text-muted-foreground">Du kan ikke ændre din egen rolle.</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditUser(null)} data-testid="edit-user-cancel">
                Annullér
              </Button>
              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                data-testid="edit-user-save"
              >
                Gem ændringer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
