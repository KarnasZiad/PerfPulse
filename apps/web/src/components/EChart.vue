<script setup lang="ts">
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { type EChartsCoreOption, use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import VChart from 'vue-echarts';
// Base styles as a file: browsers without constructable stylesheets would need inline <style>.
import 'vue-echarts/style.css';

// Only the modules the dashboard draws: the bundle stays far below the full ECharts build.
use([LineChart, BarChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

defineProps<{ option: EChartsCoreOption; label: string }>();
</script>

<template>
  <!-- The canvas is decorative for assistive technologies: the data table next to it is not. -->
  <div role="img" :aria-label="label" class="h-full w-full">
    <VChart :option="option" autoresize />
  </div>
</template>
