import { useState, useEffect } from 'react';
import { PipelineStage } from '../components/AppDataContext';

export interface StageConfiguration {
  id: number;
  isVisible: boolean;
  isReduced: boolean;
}

/** Hook managing visibility and size of pipeline stages. */
export const usePipelineStages = (pipelineStages: PipelineStage[]) => {
  const [stageConfigs, setStageConfigs] = useState<StageConfiguration[]>(
    pipelineStages.map(stage => ({ id: stage.id, isVisible: true, isReduced: false }))
  );

  useEffect(() => {
    const newConfigs = pipelineStages.map(stage => {
      const existing = stageConfigs.find(config => config.id === stage.id);
      return existing || { id: stage.id, isVisible: true, isReduced: false };
    });
    setStageConfigs(newConfigs);
  }, [pipelineStages]);

  const toggleStageVisibility = (stageId: number) => {
    setStageConfigs(prev =>
      prev.map(config =>
        config.id === stageId ? { ...config, isVisible: !config.isVisible } : config
      )
    );
  };

  const toggleStageSize = (stageId: number) => {
    setStageConfigs(prev =>
      prev.map(config =>
        config.id === stageId ? { ...config, isReduced: !config.isReduced } : config
      )
    );
  };

  return { stageConfigs, toggleStageVisibility, toggleStageSize };
};
