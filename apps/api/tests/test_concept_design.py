"""
概念设计服务测试
"""

import pytest
from app.services.concept_design import ConceptDesigner, ConceptDesign, SceneDesign


class TestConceptDesigner:
    """概念设计师测试"""
    
    def setup_method(self):
        """测试前设置"""
        self.designer = ConceptDesigner()
    
    def test_design_algorithm(self):
        """测试算法概念设计"""
        result = self.designer.design("可视化冒泡排序算法")
        
        assert result.success is True
        assert result.concept is not None
        assert result.concept.domain == "algorithm"
        assert len(result.concept.objects) > 0
        assert len(result.scenes) > 0
    
    def test_design_math(self):
        """测试数学概念设计"""
        result = self.designer.design("可视化二次函数图像")
        
        assert result.success is True
        assert result.concept is not None
        assert result.concept.domain == "math"
    
    def test_design_physics(self):
        """测试物理概念设计"""
        result = self.designer.design("可视化平抛运动")
        
        assert result.success is True
        assert result.concept is not None
        assert result.concept.domain == "physics"
    
    def test_extract_objects_algorithm(self):
        """测试算法对象提取"""
        objects = self.designer._extract_objects("排序算法", "algorithm")
        assert len(objects) > 0
    
    def test_detect_domain(self):
        """测试学科检测"""
        assert self.designer._detect_domain("排序算法") == "algorithm"
        assert self.designer._detect_domain("函数图像") == "math"
        assert self.designer._detect_domain("受力分析") == "physics"
    
    def test_complexity_calculation(self):
        """测试复杂度计算"""
        score = self.designer._calculate_complexity(
            objects=["a", "b", "c", "d", "e", "f"],
            relationships=["r1", "r2", "r3", "r4"]
        )
        assert 1 <= score <= 5
    
    def test_scene_design(self):
        """测试场景设计"""
        concept = ConceptDesign(
            title="测试",
            description="测试描述",
            domain="algorithm",
            objects=["对象 1", "对象 2"],
            key_moments=["时刻 1", "时刻 2"]
        )
        
        scenes = self.designer._design_scenes(concept)
        assert len(scenes) >= 3  # 至少包含开场、核心、总结
        assert scenes[0].scene_id == "scene_intro"
        assert scenes[-1].scene_id == "scene_summary"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
