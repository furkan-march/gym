import { useState } from 'react'
import { Segmented } from '../components/Segmented'
import { CardioSection } from './plan/CardioSection'
import { NutritionSection } from './plan/NutritionSection'
import { PostureSection } from './plan/PostureSection'
import { TrainingSection } from './plan/TrainingSection'

type PlanSection = 'training' | 'cardio' | 'posture' | 'nutrition'

const SECTION_OPTIONS: { value: PlanSection; label: string }[] = [
  { value: 'training', label: 'Training' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'posture', label: 'Posture' },
  { value: 'nutrition', label: 'Nutrition' },
]

/** Plan screen (SPEC 27): Training / Cardio & steps / Posture / Nutrition. */
export default function PlanScreen() {
  const [section, setSection] = useState<PlanSection>('training')
  return (
    <div className="mx-auto w-full max-w-lg pb-8">
      <h1 className="mt-3 mb-3 text-2xl font-bold">Plan</h1>
      <Segmented options={SECTION_OPTIONS} value={section} onChange={setSection} />
      {section === 'training' ? <TrainingSection /> : null}
      {section === 'cardio' ? <CardioSection /> : null}
      {section === 'posture' ? <PostureSection /> : null}
      {section === 'nutrition' ? <NutritionSection /> : null}
    </div>
  )
}
