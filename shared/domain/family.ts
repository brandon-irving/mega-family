// Pure family-membership rules shared by the backend and the client, so a permission rule is derived
// once and never re-typed at the call site that merely *decides whether to ask* (G6 fix: the Family tab
// used to call `family.kidThread` whenever a member's own `canReadChat` was true, including for the
// viewer's own card — where `convex/family.ts`'s `kidThread` throws FORBIDDEN, since you're never your
// own parent — crashing the app with an uncaught ConvexError instead of simply not subscribing).

/** Whether a parent may read a kid's thread (`family.kidThread`, Family → kid's read-only chat):
 * `isParentOfTarget` is `viewer.isParentOf.includes(target._id)` (never true of yourself), and
 * `parentsCanReadChat` is that kid's own `kidControls` toggle (on by default, off hides it even from
 * a parent). Both the backend's own guard and the client's "is it even worth subscribing" check call
 * this instead of each re-deriving the rule. */
export function canReadKidThread(isParentOfTarget: boolean, parentsCanReadChat: boolean | undefined): boolean {
  return isParentOfTarget && !!parentsCanReadChat;
}
