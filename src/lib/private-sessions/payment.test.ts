import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALREADY_PAID,
  isChargedOnSession,
  paymentPrompt,
  paymentState,
  privatePackageFor,
  privatePaymentProblem,
  sessionWhen,
} from "./payment";

test("paymentState: nothing linked, or only rejected (cancelled) payments, is unpaid", () => {
  assert.equal(paymentState([]), "unpaid");
  assert.equal(paymentState(["cancelled"]), "unpaid");
});

test("paymentState: a payment under review is pending", () => {
  assert.equal(paymentState(["pending"]), "pending");
  assert.equal(paymentState(["pending_payment"]), "pending");
});

test("paymentState: confirmed, used or frozen is paid", () => {
  assert.equal(paymentState(["active"]), "paid");
  assert.equal(paymentState(["expired"]), "paid");
  assert.equal(paymentState(["frozen"]), "paid");
});

test("paymentState: a rejected payment beside a new one under review", () => {
  assert.equal(paymentState(["cancelled", "pending"]), "pending");
});

const individual = { id: "p1", private_session_players: 1 };
const team = { id: "p2", private_session_players: 2 };
const monthly = { id: "m", private_session_players: null };

test("privatePackageFor: the package tagged for that many players", () => {
  assert.equal(privatePackageFor(1, [monthly, individual, team]), individual);
  assert.equal(privatePackageFor(2, [monthly, individual, team]), team);
});

test("privatePackageFor: three or more players have no package", () => {
  assert.equal(privatePackageFor(3, [monthly, individual, team]), null);
});

test("isChargedOnSession: on a private session only the payer is charged", () => {
  const session = { session_type: "private", player_id: "booker" };
  assert.equal(isChargedOnSession(session, "booker"), true);
  assert.equal(isChargedOnSession(session, "partner"), false);
});

test("isChargedOnSession: group sessions, and private sessions with no payer, charge everyone", () => {
  assert.equal(isChargedOnSession({ session_type: "group", player_id: null }, "anyone"), true);
  assert.equal(isChargedOnSession({ session_type: "private", player_id: null }, "anyone"), true);
});

const ok = {
  callerId: "booker",
  session: { session_type: "private", is_active: true, player_id: "booker" },
  playerCount: 1,
  packagePlayers: 1,
  hasLivePayment: false,
};

test("privatePaymentProblem: the booker paying the matching package", () => {
  assert.equal(privatePaymentProblem(ok), null);
});

test("privatePaymentProblem: a missing, deleted or group session", () => {
  assert.equal(privatePaymentProblem({ ...ok, session: null }), "This private session no longer exists");
  assert.equal(privatePaymentProblem({ ...ok, session: { ...ok.session, is_active: false } }), "This private session no longer exists");
  assert.equal(privatePaymentProblem({ ...ok, session: { ...ok.session, session_type: "group" } }), "This private session no longer exists");
});

test("privatePaymentProblem: only the payer pays", () => {
  assert.equal(privatePaymentProblem({ ...ok, callerId: "partner" }), "Only the player who booked this session can pay for it");
});

test("privatePaymentProblem: the package must fit the session", () => {
  assert.equal(privatePaymentProblem({ ...ok, playerCount: 2 }), "This package doesn't match the session");
  assert.equal(privatePaymentProblem({ ...ok, packagePlayers: null }), "This package doesn't match the session");
});

test("privatePaymentProblem: one live payment per session", () => {
  assert.equal(privatePaymentProblem({ ...ok, hasLivePayment: true }), ALREADY_PAID);
  assert.equal(ALREADY_PAID, "This session is already paid or under review");
});

test("sessionWhen: the day and the time, read without timezone shifts", () => {
  assert.equal(sessionWhen("2026-10-10", "20:00:00"), "Sat 10 Oct at 8:00 PM");
  assert.equal(sessionWhen("2026-10-10", "09:30"), "Sat 10 Oct at 9:30 AM");
});

test("paymentPrompt: what the payer is told on confirmation", () => {
  assert.equal(
    paymentPrompt("Sat 10 Oct at 8:00 PM", 1000),
    "Your private session on Sat 10 Oct at 8:00 PM is confirmed. You can pay 1,000 EGP from your dashboard."
  );
});
