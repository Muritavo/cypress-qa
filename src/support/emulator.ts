/**
 * These are a series of functions to control an emulator from the cypress tests
 */

import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import nodeFetch from "node-fetch";
import { FirebaseConfigShape } from "./emulator.types"

let emulatorConfig: FirebaseConfigShape;
export function setEmulatorConfig(config: FirebaseConfigShape) {
    emulatorConfig = config
}

export const killEmulatorPorts = () => {
    for (let port of Object.values(emulatorConfig.emulators).map(a => a.port)) {
        cy.exec(`yarn kill-port ${port}`).wait(500)
    }
}

function _getPort(emulator: keyof FirebaseConfigShape['emulators']) {
    if (!emulatorConfig) {
        throw new Error(`You didn't set the emulator config. Provide it by using the following at your cypress support file:

import { setEmulatorConfig } from '@muritavo/cypress-toolkit/dist/support/emulator'
...
...
...
before() {
    setEmulatorConfig(require("THE_PATH_TO_YOUR_FIREBASE_JSON"))
}
`)
    }
    const emulatorConfigSet = emulatorConfig.emulators[emulator];
    if (!emulatorConfigSet || !emulatorConfigSet.port) {
        throw new Error(`Emulator config not found`);
    }
    return emulatorConfigSet.port;
}

Cypress.Commands.add("startEmulator", (projectName, databaseToImport = "", forceStart) => {
    if (sessionStorage.getItem("last-database") === databaseToImport && !forceStart)
        return;
    killEmulatorPorts();
    const command = `yarn start-firebase-emulator ${projectName} ${databaseToImport}`;
    cy.exec(command, {
        // It takes time to up an emulator
        timeout: 60000,
    }).then(() => {
        sessionStorage.setItem("last-database", databaseToImport)
    });
})

Cypress.Commands.add("killEmulator", () => {
    sessionStorage.removeItem("last-database")
})

Cypress.Commands.add("clearFirestore", (projectId: string) => {
    return new Cypress.Promise(async (r) => {
        const testEnv = await initializeTestEnvironment({
            projectId: projectId,
            firestore: {
                host: "localhost",
                port: _getPort("firestore"),
            },
        });
        await testEnv.clearFirestore();
        testEnv.cleanup()
        r()
    }) as any
})

Cypress.Commands.add("clearAuth", (projectId: string) => {
    return new Cypress.Promise(async (r, rej) => {
        await nodeFetch(`http://localhost:${_getPort("auth")}/emulator/v1/projects/${projectId}/accounts`, {
            method: "delete"
        }).then(res => {
            if (res.status < 300)
                r()
            else
                rej(`Cleaning accounts returned ${res.status}`)
        }).catch(rej)
    }) as any
})

Cypress.Commands.add("addUser", (email: string, password, projectId) => {
    return new Cypress.Promise<void>(async (r, rej) => {
        nodeFetch(`http://localhost:${_getPort("auth")}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`, {
            body: JSON.stringify({
                email,
                password,
            }),
            headers: {
                "content-type": "application/json",
                "authorization": "Bearer owner"
            },
            method: "post"
        }).then((res) => {
            if (res.status < 300)
                r()
            else
                rej(`Creating account returned ${res.status}`)
        }).catch(e => {
            rej(e)
        })
    }) as any
})

Cypress.Commands.add("setupEmulator", (cb: (fs: any) => Promise<void>, projectId) => {
    return new Cypress.Promise<void>(async r => {
        const testEnv = await initializeTestEnvironment({
            projectId: projectId,
            firestore: {
                host: "localhost",
                port: _getPort("firestore"),
            },
        });
        await testEnv.withSecurityRulesDisabled(async (ctx: any) => {
            await cb(ctx.firestore({
                experimentalForceLongPolling: true
            }))
        });
        r()
    }) as any
})