"use client";
import { useEffect, useRef, type RefObject } from "react";
import type { State } from "./gameplay";
import type { Pointer } from "./stages";
import { controllerInput, keyboardInput } from "./sensorInput";
/** Keyboard and future gamepad feed the same pointer path; no outcomes here. */
export function useSimulation(
  state: State | null,
  send: (p: Pointer, activate?: boolean) => void,
  enabled: boolean,
  intent: RefObject<Pointer | null>,
) {
  const live = useRef(state);
  useEffect(() => {
    live.current = state;
  }, [state]);
  const mode = state?.config.input;
  useEffect(() => {
    if (!enabled || !mode || mode === "sensor") return;
    let click = false,
      last = performance.now();
    const keys = new Set<string>();
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches("input,select,button")) return;
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          " ",
          "Enter",
          "w",
          "a",
          "s",
          "d",
        ].includes(e.key)
      ) {
        e.preventDefault();
        keys.add(e.key);
        if ((e.key === " " || e.key === "Enter") && !e.repeat) click = true;
      }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key),
      clear = () => keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    let button = false;
    const timer = setInterval(() => {
      const now = performance.now(),
        dt = (now - last) / 1000;
      last = now;
      let p = {
        ...(intent.current ?? live.current?.pointer ?? { x: 0.5, y: 0.5 }),
      };
      if (mode === "controller") {
        const gamepad = navigator.getGamepads?.()[0];
        if (gamepad) {
          p = controllerInput(p, gamepad.axes, dt);
          const pressed = gamepad.buttons[0]?.pressed ?? false;
          click ||= pressed && !button;
          button = pressed;
          send(p, click);
          click = false;
          return;
        }
      }
      if (keys.size || click) {
        p = keyboardInput(p, keys, dt);
        send(p, click);
        click = false;
      }
    }, 33);
    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [enabled, mode, send, intent]);
}
