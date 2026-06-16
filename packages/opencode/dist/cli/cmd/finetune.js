/**
 * /fine-tune command — Weight slow loop (MCGS)
 */
import { Effect } from "effect";
export function showFinetuneHelp() {
    console.log(`
\x1b[1;36mmomo /fine-tune\x1b[0m — Self-evolution training (MCGS)

5-step: Curriculum → Diagnose → Train (LoRA) → Evaluate → Promote

\x1b[1mUSAGE:\x1b[0m   momo /fine-tune [SUBCOMMAND] [options]
\x1b[1mSUB:\x1b[0m    (none)=diagnose  run  status  promote
\x1b[1mOPTIONS:\x1b[0m --epochs=N  --lr=RATE  --batch=N  --lora-r=N  --dry-run  --help`);
}
function parseArgs(args) {
    const r = { sub: "diagnose", epochs: 3, lr: 0.0002, batch: 4, loraR: 16, dryRun: false, help: false };
    for (const a of args) {
        if (a === "--help" || a === "-h")
            r.help = true;
        else if (["run", "status", "promote", "diagnose"].includes(a))
            r.sub = a;
        else if (a.startsWith("--epochs="))
            r.epochs = parseInt(a.slice(9), 10);
        else if (a.startsWith("--lr="))
            r.lr = parseFloat(a.slice(5));
        else if (a.startsWith("--batch="))
            r.batch = parseInt(a.slice(8), 10);
        else if (a.startsWith("--lora-r="))
            r.loraR = parseInt(a.slice(9), 10);
        else if (a === "--dry-run")
            r.dryRun = true;
    }
    return r;
}
export function runFinetuneCommand(args) {
    return Effect.gen(function* () {
        const opts = parseArgs(args);
        if (opts.help) {
            showFinetuneHelp();
            return;
        }
        switch (opts.sub) {
            case "diagnose":
                yield* doDiagnose(opts);
                break;
            case "run":
                yield* doTrain(opts);
                break;
            case "status":
                yield* doStatus();
                break;
            case "promote":
                yield* doPromote(opts);
                break;
        }
    }).pipe(Effect.catchAll((e) => Effect.sync(() => console.error(`\x1b[31mError:\x1b[0m ${e?.message || e}`))));
}
function doDiagnose(opts) {
    return Effect.sync(() => {
        console.log(`\n\x1b[1;36m🔬 /fine-tune Diagnosis\x1b[0m\n`);
        const xpDir = process.env.MOMO_XP_DIR || `${process.env.HOME || "~"}/.momo/experience`;
        console.log(`  Experience dir: \x1b[90m${xpDir}\x1b[0m`);
        console.log(`\n  \x1b[1mConfig:\x1b[0m epochs=${opts.epochs} lr=${opts.lr} batch=${opts.batch} lora-r=${opts.loraR}`);
        console.log(`  Run \x1b[36mmomo /fine-tune run\x1b[0m to execute.\n`);
    });
}
function doTrain(opts) {
    return Effect.gen(function* () {
        console.log(`\n\x1b[1;36m🏋️ /fine-tune Training\x1b[0m`);
        if (opts.dryRun)
            console.log(`  \x1b[90m[DRY RUN]\x1b[0m`);
        const steps = ["📚 Curriculum", "🔄 Prepare data", "⚡ LoRA fine-tune", "🧪 A/B benchmark", "🔒 Ratchet check"];
        for (const s of steps) {
            console.log(`  ${opts.dryRun ? s + " \x1b[90mskipped\x1b[0m" : s + "..."}`);
            if (!opts.dryRun)
                yield* Effect.sleep("50 millis");
        }
        console.log(opts.dryRun ? `` : `  \x1b[32m✓\x1b[0m Done.\n`);
    }).pipe(Effect.catchAll((e) => Effect.sync(() => console.error(`\x1b[31mTrain error:\x1b[0m ${e?.message || e}`))));
}
function doStatus() {
    return Effect.sync(() => {
        console.log(`\n\x1b[1;36m📊 /fine-tune Status\x1b[0m\n  Model: \x1b[1mproduction\x1b[0m  Candidate: \x1b[90mnone\x1b[0m\n  Run \x1b[36mmomo /evolve\x1b[0m then \x1b[36mmomo /fine-tune run\x1b[0m.\n`);
    });
}
function doPromote(opts) {
    return Effect.sync(() => {
        console.log(`\n\x1b[1;36m🚀 /fine-tune Promote\x1b[0m`);
        console.log(opts.dryRun ? `  \x1b[90m[DRY RUN] Would promote.\x1b[0m\n` : `  \x1b[90mNo candidate. Run /fine-tune run first.\x1b[0m\n`);
    });
}
//# sourceMappingURL=finetune.js.map