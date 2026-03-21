#!/usr/bin/env python3
"""
数学领域 Manim 动画测试用例

测试范围：
1. 函数图像绘制
2. 几何图形变换
3. 公式推导展示
4. 微积分可视化
"""

from manim import *
import numpy as np


class TestFunctionGraph(Scene):
    """测试 1: 函数图像绘制 - 二次函数"""
    
    def construct(self):
        # 创建坐标轴
        axes = Axes(
            x_range=[-3, 3, 1],
            y_range=[-1, 10, 2],
            axis_config={"color": BLUE},
        )
        
        # 创建函数图像 y = x^2
        parabola = axes.plot(lambda x: x**2, color=YELLOW)
        
        # 添加标签
        title = Text("二次函数 y = x²", font_size=36).to_edge(UP)
        axes_labels = axes.get_axis_labels(x_label="x", y_label="y")
        
        # 动画
        self.play(Write(title))
        self.wait(1.5)
        self.play(Create(axes), Write(axes_labels))
        self.wait(1.5)
        self.play(Create(parabola), run_time=2)
        self.wait(2.0)
        self.play(FadeOut(VGroup(title, axes, axes_labels, parabola)))


class TestGeometricTransform(Scene):
    """测试 2: 几何图形变换 - 三角形旋转"""
    
    def construct(self):
        # 创建三角形
        triangle = Triangle(color=GREEN, fill_opacity=0.5)
        triangle.set_fill(GREEN, opacity=0.5)
        
        # 创建旋转中心点
        center_dot = Dot(color=RED)
        
        # 添加标签
        title = Text("几何变换：旋转", font_size=36).to_edge(UP)
        
        # 动画
        self.play(Write(title))
        self.wait(1.5)
        self.play(Create(triangle), Create(center_dot))
        self.wait(1.5)
        
        # 旋转 120 度
        self.play(Rotate(triangle, angle=120*DEGREES, about_point=center_dot.get_center()), run_time=2)
        self.wait(2.0)
        
        # 再旋转 120 度
        self.play(Rotate(triangle, angle=120*DEGREES, about_point=center_dot.get_center()), run_time=2)
        self.wait(2.0)
        
        self.play(FadeOut(VGroup(title, triangle, center_dot)))


class TestFormulaDerivation(Scene):
    """测试 3: 公式推导 - 勾股定理"""
    
    def construct(self):
        # 标题
        title = Text("勾股定理证明", font_size=36).to_edge(UP)
        
        # 公式
        pythagorean = MathTex("a^2 + b^2 = c^2", font_size=48)
        
        # 直角三角形
        triangle = Polygon(
            ORIGIN,
            RIGHT * 3,
            UP * 2,
            color=BLUE,
            fill_opacity=0.3
        )
        
        # 边长标签
        a_label = MathTex("a", font_size=32).next_to(triangle, DOWN, buff=0.1)
        b_label = MathTex("b", font_size=32).next_to(triangle, RIGHT, buff=0.1)
        c_label = MathTex("c", font_size=32).move_to(triangle.get_center() + UR * 0.3)
        
        # 动画
        self.play(Write(title))
        self.wait(1.5)
        self.play(Create(triangle))
        self.wait(1.5)
        self.play(Write(a_label), Write(b_label), Write(c_label))
        self.wait(2.0)
        self.play(pythagorean.animate.to_edge(DOWN))
        self.wait(2.0)
        self.play(FadeOut(VGroup(title, triangle, a_label, b_label, c_label, pythagorean)))


class TestCalculusVisualization(Scene):
    """测试 4: 微积分可视化 - 定积分面积"""
    
    def construct(self):
        # 标题
        title = Text("定积分：曲线下的面积", font_size=36).to_edge(UP)
        
        # 坐标轴
        axes = Axes(
            x_range=[0, 4, 1],
            y_range=[0, 4, 1],
            axis_config={"color": BLUE},
        )
        
        # 函数 f(x) = x^2/2
        curve = axes.plot(lambda x: x**2/2, color=YELLOW, x_range=[0, 3])
        
        # 填充面积
        area = axes.get_area(curve, x_range=[0, 3], color=GREEN, opacity=0.3)
        
        # 积分公式
        integral_formula = MathTex(
            "\\int_0^3 \\frac{x^2}{2} dx", font_size=42
        ).to_edge(DOWN)
        
        # 动画
        self.play(Write(title))
        self.wait(1.5)
        self.play(Create(axes))
        self.wait(1.5)
        self.play(Create(curve), run_time=2)
        self.wait(1.5)
        self.play(FadeIn(area))
        self.wait(2.0)
        self.play(Write(integral_formula))
        self.wait(2.0)
        self.play(FadeOut(VGroup(title, axes, curve, area, integral_formula)))


if __name__ == "__main__":
    # 运行所有测试
    print("数学测试用例准备就绪")
    print("运行命令：manim -pql test_math_scenes.py <SceneName>")
    print("可用场景：TestFunctionGraph, TestGeometricTransform, TestFormulaDerivation, TestCalculusVisualization")
