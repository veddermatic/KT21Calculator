import { at } from "lodash";
import Model from "./Model";
import { random } from "mathjs";
import {
  addToMapValue,
  binomialPmf,
  normalizeMapValues,
} from 'src/Util';
import { CombatOptions } from "./CombatOptions";
import { calcMultiRoundDamage } from "src/CalcEngineCommon";

const singleShieldProb = 0.375;

class Sf {
  public s: number; // successes
  public f: number; // failures

  public constructor(s: number = 0, f: number = 0) {
    this.s = s;
    this.f = f;
  }

  public add(other: Sf): void {
    this.s += other.s;
    this.f += other.f;
  }
}

export function calcDmgProbs(
  attacker: Model,
  defender: Model,
  options: CombatOptions = new CombatOptions(),
): Map<number, number> // damage to prob
{
  const atkSuccessProbs = makeSuccessProbs(attacker, options.numSimulations);
  const defSuccessProbs = makeSuccessProbs(defender, options.numSimulations);
  let dmgProbs = new Map<number, number>();

  for (const [atkSuccesses, atkProb] of atkSuccessProbs) {
    for (const [defSuccesses, defProb] of defSuccessProbs) {
      let origDmg = atkSuccesses - defSuccesses;

      if(!options.attackerCanBeDamaged) {
        origDmg = Math.max(0, origDmg);
      }
      const [dmgGiver, dmgReceiver] = origDmg >= 0 ? [attacker, defender] : [defender, attacker];
      const netArmor = Math.max(dmgReceiver.armor - dmgGiver.ap);
      const numShieldDice = origDmg === 0 ? 0 : dmgReceiver.numShieldDice;
      const atkAndDefProb = atkProb * defProb;

      for (let shieldSuccesses = 0;
        shieldSuccesses <= numShieldDice;
        shieldSuccesses++
      ) {
        const shieldProb = numShieldDice === 0 ? 1 : binomialPmf(numShieldDice, shieldSuccesses, singleShieldProb);
        const postShieldDmg = Math.max(0, Math.abs(origDmg) - shieldSuccesses);
        const postArmorDmg = Math.max(0, postShieldDmg - netArmor);
        const postToxicDmg = postArmorDmg + dmgGiver.toxicDmg;
        addToMapValue(dmgProbs, Math.sign(origDmg) * postToxicDmg, atkAndDefProb * shieldProb);
      }
    }
  }
  if(options.numRounds > 1) {
    dmgProbs = calcMultiRoundDamage(dmgProbs, options.numRounds);
  }
  return dmgProbs;
}

function makeSuccessProbs(
  model: Model,
  numSimulations: number,
): Map<number, number> {
  const successCounts = new Map<number, number>();
  for(let i = 0; i < numSimulations; i++) {
    const numSuccesses = simulatedNumSuccessesFromMultiRoll(
      model.numDice,
      model.diceStat,
      model.numRerolls,
    );
    addToMapValue(successCounts, numSuccesses, 1);
  }
  normalizeMapValues(successCounts, numSimulations);
  return successCounts;
}

function simulatedNumSuccessesFromMultiRoll(
  numDice: number,
  diceStat: number,
  numRerolls: number = 0,
): number {
  const sf = new Sf();

  for(let dieIdx = 0; dieIdx < numDice; dieIdx++) {
    sf.add(simulatedSfFromSingleRoll(diceStat));
  }

  const numOriginalSuccesses = sf.s;
  const numRerolledSuccesses
    = numRerolls === 0
    ? 0
    : simulatedNumSuccessesFromMultiRoll(Math.min(numRerolls, sf.f), diceStat);
  return numOriginalSuccesses + numRerolledSuccesses;
}

function simulatedSfFromSingleRoll(diceStat: number): Sf {
  const pipLo = 1;
  const pipHi = 8;
  const sf = new Sf();
  let pipOutcome: number;
  do {
    pipOutcome = random(pipLo, pipHi);
    if(pipOutcome >= diceStat) {
      sf.s++;
    }
    else {
      sf.f++;
    }
  } while(pipOutcome === pipHi);
  return sf;
}