import { useQuery } from "convex/react";
import { useOnlineMutation } from "@/hooks/use-online-mutation";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
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
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { IconNote } from "@/components/icon-note";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  STRUCTURE_NAME_LIMIT,
  normalizeStructureName,
  structureNameError,
} from "@/buildings/names";
import type { StructureKind } from "@/buildings/names";
import { describeContent, describeLabels } from "@/buildings/content";
import { failureMessage } from "@/lib/errors";
import { createStandaloneObjectId } from "@/lib/identity";
import { asBuildingId, asFloorId } from "@/lib/objectIds";
import { useStructureDialog } from "@/buildings/useStructureDialog";
import type { StructureAction } from "@/buildings/useStructureDialog";
import { useMapStore } from "@/store/useMapStore";
import { api } from "../../convex/_generated/api";

/** The building or floor dialog `useStructureDialog` holds open, if any. */
export function StructureDialog() {
  const action = useStructureDialog((state) => state.action);
  const onClose = useStructureDialog((state) => state.close);
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  if (action?.kind === "remove") {
    return <RemoveDialog action={action} onClose={onClose} />;
  }
  return (
    <Dialog open={action !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted per action, so each starts from its own fields and ids. */}
        {action?.kind === "create-building" ? (
          <CreateBuildingForm siteId={action.siteId} onDone={onClose} />
        ) : action?.kind === "add-floor" ? (
          <AddFloorForm action={action} onDone={onClose} />
        ) : action?.kind === "rename" ? (
          <RenameForm action={action} onDone={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function NameField({
  id,
  label,
  value,
  onChange,
  autoFocus = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        required
        autoFocus={autoFocus}
        maxLength={STRUCTURE_NAME_LIMIT}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

/** Checks the names, runs `save` and reports its refusal in the form. */
function useNamesForm(onDone: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (
    event: FormEvent,
    names: Array<[StructureKind, string]>,
    save: (normalized: Array<string>) => Promise<void>,
  ) => {
    event.preventDefault();
    const normalized = names.map(([, name]) => normalizeStructureName(name));
    const invalid = names
      .map(([kind], index) => structureNameError(kind, normalized[index]))
      .find((message) => message !== null);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await save(normalized);
      onDone();
    } catch (caught) {
      setError(failureMessage(caught, "editor"));
    } finally {
      setSaving(false);
    }
  };
  return { error, saving, submit };
}

function FormFooter({
  error,
  saving,
  label,
  onCancel,
}: {
  error: string | null;
  saving: boolean;
  label: string;
  onCancel: () => void;
}) {
  return (
    <>
      {error ? <FieldError>{error}</FieldError> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={saving}>
          {label}
        </Button>
      </DialogFooter>
    </>
  );
}

function CreateBuildingForm({
  siteId,
  onDone,
}: {
  siteId: string;
  onDone: () => void;
}) {
  const create = useOnlineMutation(api.buildings.create);
  const id = useId();
  // One pair of ids per form, so a retry after a lost answer finds them.
  const [buildingId] = useState(() => createStandaloneObjectId("building"));
  const [floorId] = useState(() => createStandaloneObjectId("floor"));
  const [name, setName] = useState("");
  const [floorName, setFloorName] = useState("Rez-de-chaussée");
  const { error, saving, submit } = useNamesForm(onDone);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) =>
        void submit(
          event,
          [
            ["building", name],
            ["floor", floorName],
          ],
          async ([building, floor]) => {
            await create({
              siteId,
              objectId: buildingId,
              name: building,
              firstFloor: { objectId: floorId, name: floor },
            });
            const { setCurrentBuilding, setCurrentFloor } =
              useMapStore.getState();
            setCurrentBuilding(asBuildingId(buildingId));
            setCurrentFloor(asFloorId(floorId));
          },
        )
      }
    >
      <DialogHeader>
        <DialogTitle>Créer un bâtiment</DialogTitle>
      </DialogHeader>
      <FieldGroup>
        <NameField
          id={`${id}-building`}
          label="Nom du bâtiment"
          value={name}
          onChange={setName}
          autoFocus
        />
        <NameField
          id={`${id}-floor`}
          label="Premier étage"
          value={floorName}
          onChange={setFloorName}
        />
      </FieldGroup>
      <FormFooter
        error={error}
        saving={saving}
        label="Créer le bâtiment"
        onCancel={onDone}
      />
    </form>
  );
}

function AddFloorForm({
  action,
  onDone,
}: {
  action: Extract<StructureAction, { kind: "add-floor" }>;
  onDone: () => void;
}) {
  const create = useOnlineMutation(api.floors.create);
  const id = useId();
  const [floorId] = useState(() => createStandaloneObjectId("floor"));
  const [name, setName] = useState("");
  const { error, saving, submit } = useNamesForm(onDone);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) =>
        void submit(event, [["floor", name]], async ([floor]) => {
          await create({
            objectId: floorId,
            buildingId: action.buildingId,
            name: floor,
          });
          const { setCurrentBuilding, setCurrentFloor } =
            useMapStore.getState();
          setCurrentBuilding(asBuildingId(action.buildingId));
          setCurrentFloor(asFloorId(floorId));
        })
      }
    >
      <DialogHeader>
        <DialogTitle>Ajouter un étage à {action.buildingName}</DialogTitle>
      </DialogHeader>
      <FieldGroup>
        <NameField
          id={`${id}-floor`}
          label="Nom de l'étage"
          value={name}
          onChange={setName}
          autoFocus
        />
      </FieldGroup>
      <FormFooter
        error={error}
        saving={saving}
        label="Ajouter l'étage"
        onCancel={onDone}
      />
    </form>
  );
}

function RenameForm({
  action,
  onDone,
}: {
  action: Extract<StructureAction, { kind: "rename" }>;
  onDone: () => void;
}) {
  const renameBuilding = useOnlineMutation(api.buildings.rename);
  const renameFloor = useOnlineMutation(api.floors.rename);
  const id = useId();
  const [name, setName] = useState(action.name);
  const { error, saving, submit } = useNamesForm(onDone);
  const building = action.target === "building";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) =>
        void submit(event, [[action.target, name]], async ([next]) => {
          if (next === action.name) return;
          const rename = building ? renameBuilding : renameFloor;
          await rename({ id: action.id, name: next });
        })
      }
    >
      <DialogHeader>
        <DialogTitle>
          {building ? "Renommer le bâtiment" : "Renommer l'étage"}
        </DialogTitle>
      </DialogHeader>
      <FieldGroup>
        <NameField
          id={`${id}-name`}
          label="Nom"
          value={name}
          onChange={setName}
          autoFocus
        />
      </FieldGroup>
      <FormFooter
        error={error}
        saving={saving}
        label="Renommer"
        onCancel={onDone}
      />
    </form>
  );
}

function RemoveDialog({
  action,
  onClose,
}: {
  action: Extract<StructureAction, { kind: "remove" }>;
  onClose: () => void;
}) {
  const removeBuilding = useOnlineMutation(api.buildings.remove);
  const removeFloor = useOnlineMutation(api.floors.remove);
  const building = action.target === "building";
  const buildingContent = useQuery(
    api.buildings.content,
    building ? { id: action.id } : "skip",
  );
  const floorContent = useQuery(
    api.floors.content,
    building ? "skip" : { id: action.id },
  );
  const content = building ? buildingContent : floorContent;
  // Live, so the button frees itself as soon as the last device leaves.
  const remaining = content ? describeContent(content) : null;
  const canRemove = content !== undefined && remaining === null;
  // Texts do not keep a floor, but the user hears they go with it (4.2).
  const labels = content && !remaining ? describeLabels(content) : null;
  const along = labels ? ` et ${labels}` : "";

  const remove = async () => {
    onClose();
    try {
      const run = building ? removeBuilding : removeFloor;
      await run({ id: action.id });
    } catch (caught) {
      toast.error(failureMessage(caught, "editor"));
    }
  };

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {building
              ? `Supprimer le bâtiment « ${action.name} »${along} ?`
              : `Supprimer l'étage « ${action.name} »${along} ?`}
          </AlertDialogTitle>
          {remaining ? (
            <AlertDialogDescription render={<div />}>
              <IconNote icon={Alert02Icon} tone="warning">
                {building
                  ? `Ses étages portent encore ${remaining}.`
                  : `Il porte encore ${remaining}.`}
              </IconNote>
            </AlertDialogDescription>
          ) : building ? (
            <AlertDialogDescription>
              Ses étages sont supprimés avec lui.
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!canRemove}
            onClick={() => void remove()}
          >
            {building ? "Supprimer le bâtiment" : "Supprimer l'étage"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
